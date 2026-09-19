export interface SuggestedParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
  sampleValue: string;
}

export interface ParsedCurl {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  rawHeadersText: string;
  body: string;
  suggestedName: string;
  suggestedTitle: string;
  suggestedParams: SuggestedParam[];
  urlWithPlaceholders: string;
  bodyWithPlaceholders: string;
}

/**
 * Phân tích câu lệnh cURL (từ Postman, Chrome DevTools, Swagger, Terminal)
 * thành cấu trúc gọi HTTP Request hoàn chỉnh cho Custom AI Tool.
 */
export function parseCurlCommand(curlInput: string): ParsedCurl | null {
  if (!curlInput || !curlInput.trim()) return null;

  // Chuẩn hoá các ký tự xuống dòng tiếp nối (\ ở Linux/Mac, ^ ở Windows)
  let cleaned = curlInput
    .replace(/\\\r?\n/g, ' ')
    .replace(/\^[\r\n]+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim();

  // Đảm bảo bắt đầu bằng curl
  if (!cleaned.toLowerCase().startsWith('curl')) {
    cleaned = 'curl ' + cleaned;
  }

  // Tách token thông minh có nhận diện dấu ngoặc kép / nháy đơn
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if ((char === '"' || char === "'") && (i === 0 || cleaned[i - 1] !== '\\')) {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (quoteChar === char) {
        inQuote = false;
        quoteChar = '';
      } else {
        current += char;
      }
    } else if (/\s/.test(char) && !inQuote) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current.length > 0) tokens.push(current);

  if (tokens.length <= 1) return null;

  let method = '';
  let url = '';
  const headers: Record<string, string> = {};
  let body = '';

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    // Method flag
    if (token === '-X' || token === '--request') {
      method = (tokens[++i] || '').toUpperCase();
    } else if (token.startsWith('-X')) {
      method = token.slice(2).toUpperCase();
    }
    // Headers flag
    else if (token === '-H' || token === '--header') {
      const headerStr = tokens[++i] || '';
      const colonIdx = headerStr.indexOf(':');
      if (colonIdx > -1) {
        const key = headerStr.slice(0, colonIdx).trim();
        const val = headerStr.slice(colonIdx + 1).trim();
        headers[key] = val;
      }
    }
    // Body / Data flags
    else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary' ||
      token === '--data-ascii' ||
      token === '--data-json'
    ) {
      body = tokens[++i] || '';
      if (!method) method = 'POST';
    }
    // Basic Auth flag
    else if (token === '-u' || token === '--user') {
      const userPass = tokens[++i] || '';
      if (typeof btoa !== 'undefined') {
        headers['Authorization'] = `Basic ${btoa(userPass)}`;
      } else if (typeof Buffer !== 'undefined') {
        headers['Authorization'] = `Basic ${Buffer.from(userPass).toString('base64')}`;
      }
    }
    // Explicit URL flag
    else if (token === '--url') {
      url = tokens[++i] || '';
    }
    // Positional URL (không bắt đầu bằng dấu gạch ngang '-')
    else if (!token.startsWith('-') && !url) {
      url = token;
    }
  }

  if (!url) return null;

  // Chuẩn hoá URL
  url = url.trim();

  // Xác định method mặc định nếu chưa khai báo
  if (!method) {
    method = body ? 'POST' : 'GET';
  }

  // Chuẩn hoá method sang danh sách hợp lệ
  const validMethods: Array<ParsedCurl['method']> = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const finalMethod = validMethods.includes(method as any) ? (method as ParsedCurl['method']) : 'POST';

  // Định dạng Body nếu là JSON hợp lệ
  let formattedBody = body;
  let parsedJsonBody: any = null;
  if (body) {
    try {
      parsedJsonBody = JSON.parse(body);
      formattedBody = JSON.stringify(parsedJsonBody, null, 2);
    } catch {
      // Giữ nguyên text thô nếu không phải JSON
    }
  }

  // Tự động trích xuất tham số từ URL Query String
  const suggestedParams: SuggestedParam[] = [];
  let urlWithPlaceholders = url;
  let suggestedName = '';
  let suggestedTitle = '';

  try {
    const parsedUrl = new URL(url);

    parsedUrl.searchParams.forEach((val, key) => {
      suggestedParams.push({
        name: key,
        type: !isNaN(Number(val)) && val.trim() !== '' ? 'number' : 'string',
        description: `Tham số ${key} (mẫu: ${val})`,
        required: true,
        sampleValue: val,
      });

      // Thay thế query param bằng {{tên_biến}}
      urlWithPlaceholders = urlWithPlaceholders.replace(
        new RegExp(`([?&]${escapeRegex(key)}=)[^&]*`),
        (_match, p1) => `${p1}{{${key}}}`
      );
    });

    // Tạo tên gợi ý từ URL pathname
    const segments = parsedUrl.pathname
      .split('/')
      .filter(Boolean)
      .filter(
        (s) =>
          !s.startsWith('v1') &&
          !s.startsWith('v2') &&
          !s.startsWith('api') &&
          !/^\d+$/.test(s)
      );

    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      const prev = segments.length > 1 ? segments[segments.length - 2] : '';
      const rawName = (prev ? `${prev}_${last}` : last)
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .toLowerCase();
      suggestedName = rawName;
      suggestedTitle = (prev ? `${prev} ${last}` : last)
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  } catch {
    // URL không hợp lệ hoặc URL tương đối
  }

  // Nếu pathname chưa trích xuất được tên, dùng fallback
  if (!suggestedName) {
    suggestedName = `tool_${finalMethod.toLowerCase()}_api`;
    suggestedTitle = `Gọi API ${finalMethod}`;
  }

  // Tự động trích xuất tham số từ các trường cấp 1 của JSON Body
  let bodyWithPlaceholders = formattedBody;
  if (parsedJsonBody && typeof parsedJsonBody === 'object' && !Array.isArray(parsedJsonBody)) {
    const bodyObjCopy = { ...parsedJsonBody };
    Object.entries(parsedJsonBody).forEach(([key, val]) => {
      if (!suggestedParams.some((p) => p.name === key)) {
        suggestedParams.push({
          name: key,
          type:
            typeof val === 'number'
              ? 'number'
              : typeof val === 'boolean'
              ? 'boolean'
              : 'string',
          description: `Trường ${key} trong body dữ liệu`,
          required: true,
          sampleValue: String(val),
        });
      }
      // Đặt placeholder trong body template
      bodyObjCopy[key] = `{{${key}}}`;
    });
    bodyWithPlaceholders = JSON.stringify(bodyObjCopy, null, 2);
  }

  const rawHeadersText =
    Object.keys(headers).length > 0 ? JSON.stringify(headers, null, 2) : '';

  return {
    method: finalMethod,
    url,
    headers,
    rawHeadersText,
    body: formattedBody,
    suggestedName,
    suggestedTitle,
    suggestedParams,
    urlWithPlaceholders,
    bodyWithPlaceholders,
  };
}

function escapeRegex(string: string) {
  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}
