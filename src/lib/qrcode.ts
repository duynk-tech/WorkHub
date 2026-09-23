/**
 * Bộ sinh mã QR Code Vector (SVG) thuần TypeScript — không phụ thuộc thư viện ngoài.
 * Tuân theo chuẩn ISO/IEC 18004 (Hỗ trợ QR Version 1 đến 10, ECC Level M).
 * Xuất trực tiếp chuỗi SVG sắc nét phục vụ hiển thị web và in tem nhãn nhiệt.
 */

// Bảng đa thức Galois Field GF(256) cho mã hóa Reed-Solomon
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);
(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d; // 285
  }
  for (let i = 255; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
})();

function gMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function getGeneratorPolynomial(numEcc: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < numEcc; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    const factor = EXP_TABLE[i];
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= poly[j];
      nextPoly[j + 1] ^= gMul(poly[j], factor);
    }
    poly = nextPoly;
  }
  return poly;
}

function calculateReedSolomon(data: Uint8Array, numEcc: number): Uint8Array {
  const gen = getGeneratorPolynomial(numEcc);
  const remainder = new Uint8Array(numEcc);

  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    for (let j = 0; j < numEcc - 1; j++) {
      remainder[j] = remainder[j + 1] ^ gMul(gen[j + 1], factor);
    }
    remainder[numEcc - 1] = gMul(gen[numEcc], factor);
  }
  return remainder;
}

// Bảng tham số dung lượng và ECC cho QR (Level M: ~15% error correction)
interface VersionInfo {
  version: number;
  totalCodewords: number;
  eccCodewordsPerBlock: number;
  numBlocksGroup1: number;
  dataCodewordsGroup1: number;
  numBlocksGroup2: number;
  dataCodewordsGroup2: number;
  alignmentPatterns: number[];
}

const VERSION_TABLE_M: VersionInfo[] = [
  { version: 1, totalCodewords: 26, eccCodewordsPerBlock: 10, numBlocksGroup1: 1, dataCodewordsGroup1: 16, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [] },
  { version: 2, totalCodewords: 44, eccCodewordsPerBlock: 16, numBlocksGroup1: 1, dataCodewordsGroup1: 28, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 18] },
  { version: 3, totalCodewords: 70, eccCodewordsPerBlock: 26, numBlocksGroup1: 1, dataCodewordsGroup1: 44, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 22] },
  { version: 4, totalCodewords: 100, eccCodewordsPerBlock: 18, numBlocksGroup1: 2, dataCodewordsGroup1: 32, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 26] },
  { version: 5, totalCodewords: 134, eccCodewordsPerBlock: 24, numBlocksGroup1: 2, dataCodewordsGroup1: 43, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 30] },
  { version: 6, totalCodewords: 172, eccCodewordsPerBlock: 16, numBlocksGroup1: 4, dataCodewordsGroup1: 27, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 34] },
  { version: 7, totalCodewords: 196, eccCodewordsPerBlock: 18, numBlocksGroup1: 4, dataCodewordsGroup1: 31, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 22, 38] },
  { version: 8, totalCodewords: 242, eccCodewordsPerBlock: 22, numBlocksGroup1: 2, dataCodewordsGroup1: 38, numBlocksGroup2: 2, dataCodewordsGroup2: 39, alignmentPatterns: [6, 24, 42] },
  { version: 9, totalCodewords: 292, eccCodewordsPerBlock: 22, numBlocksGroup1: 3, dataCodewordsGroup1: 36, numBlocksGroup2: 2, dataCodewordsGroup2: 37, alignmentPatterns: [6, 26, 46] },
  { version: 10, totalCodewords: 346, eccCodewordsPerBlock: 26, numBlocksGroup1: 4, dataCodewordsGroup1: 43, numBlocksGroup2: 1, dataCodewordsGroup2: 44, alignmentPatterns: [6, 28, 50] },
];

function selectVersion(dataLen: number): VersionInfo {
  // Byte mode overhead: 4 bits mode + 8 or 16 bits count
  for (const v of VERSION_TABLE_M) {
    const totalDataCapacity = v.numBlocksGroup1 * v.dataCodewordsGroup1 + v.numBlocksGroup2 * v.dataCodewordsGroup2;
    const headerBits = 4 + (v.version < 10 ? 8 : 16);
    const maxBytes = Math.floor((totalDataCapacity * 8 - headerBits) / 8);
    if (dataLen <= maxBytes) {
      return v;
    }
  }
  return VERSION_TABLE_M[VERSION_TABLE_M.length - 1];
}

class BitBuffer {
  private buffer: number[] = [];
  private length: number = 0;

  put(num: number, length: number) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }

  putBit(bit: boolean) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= 0x80 >>> (this.length % 8);
    }
    this.length++;
  }

  getLength(): number {
    return this.length;
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

export function createQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);
  const versionInfo = selectVersion(rawBytes.length);
  const totalDataBytes = versionInfo.numBlocksGroup1 * versionInfo.dataCodewordsGroup1 + versionInfo.numBlocksGroup2 * versionInfo.dataCodewordsGroup2;

  const bb = new BitBuffer();
  // Mode: Byte (0100)
  bb.put(4, 4);
  // Character count indicator
  bb.put(rawBytes.length, versionInfo.version < 10 ? 8 : 16);
  // Data
  for (let i = 0; i < rawBytes.length; i++) {
    bb.put(rawBytes[i], 8);
  }

  // Terminator (up to 4 bits)
  const remainingBits = totalDataBytes * 8 - bb.getLength();
  bb.put(0, Math.min(4, Math.max(0, remainingBits)));

  // Pad to byte boundary
  while (bb.getLength() % 8 !== 0) {
    bb.putBit(false);
  }

  // Pad bytes (0xEC, 0x11)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bb.getLength() < totalDataBytes * 8) {
    bb.put(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  const dataBytes = bb.getBytes();

  // Chia blocks và tính toán Reed-Solomon ECC
  const blocks: { data: Uint8Array; ecc: Uint8Array }[] = [];
  let byteOffset = 0;

  for (let i = 0; i < versionInfo.numBlocksGroup1; i++) {
    const d = dataBytes.slice(byteOffset, byteOffset + versionInfo.dataCodewordsGroup1);
    byteOffset += versionInfo.dataCodewordsGroup1;
    const ecc = calculateReedSolomon(d, versionInfo.eccCodewordsPerBlock);
    blocks.push({ data: d, ecc });
  }

  for (let i = 0; i < versionInfo.numBlocksGroup2; i++) {
    const d = dataBytes.slice(byteOffset, byteOffset + versionInfo.dataCodewordsGroup2);
    byteOffset += versionInfo.dataCodewordsGroup2;
    const ecc = calculateReedSolomon(d, versionInfo.eccCodewordsPerBlock);
    blocks.push({ data: d, ecc });
  }

  // Interleave data và ECC codewords
  const finalCodewords: number[] = [];
  const maxDataLen = Math.max(versionInfo.dataCodewordsGroup1, versionInfo.dataCodewordsGroup2);
  for (let i = 0; i < maxDataLen; i++) {
    for (const b of blocks) {
      if (i < b.data.length) finalCodewords.push(b.data[i]);
    }
  }
  for (let i = 0; i < versionInfo.eccCodewordsPerBlock; i++) {
    for (const b of blocks) {
      finalCodewords.push(b.ecc[i]);
    }
  }

  // Khởi tạo Matrix (Module count = version * 4 + 17)
  const size = versionInfo.version * 4 + 17;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // 1. Finder patterns (7x7) tại 3 góc
  function placeFinder(startX: number, startY: number) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isDark = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        matrix[startY + r][startX + c] = isDark;
        reserved[startY + r][startX + c] = true;
      }
    }
    // Separator trắng xung quanh
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          const y = startY + r;
          const x = startX + c;
          if (y >= 0 && y < size && x >= 0 && x < size) {
            matrix[y][x] = false;
            reserved[y][x] = true;
          }
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(size - 7, 0);
  placeFinder(0, size - 7);

  // 2. Alignment patterns cho Version >= 2
  const coords = versionInfo.alignmentPatterns;
  for (let i = 0; i < coords.length; i++) {
    for (let j = 0; j < coords.length; j++) {
      const y = coords[i];
      const x = coords[j];
      // Bỏ qua nếu trùng finder pattern
      if ((x < 9 && y < 9) || (x > size - 10 && y < 9) || (x < 9 && y > size - 10)) continue;

      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const isDark = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
          matrix[y + r][x + c] = isDark;
          reserved[y + r][x + c] = true;
        }
      }
    }
  }

  // 3. Timing patterns (Row 6, Col 6)
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) {
      matrix[6][i] = i % 2 === 0;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      matrix[i][6] = i % 2 === 0;
      reserved[i][6] = true;
    }
  }

  // 4. Dark module
  matrix[4 * versionInfo.version + 9][8] = true;
  reserved[4 * versionInfo.version + 9][8] = true;

  // 5. Reserved format info areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = size - 8; i < size; i++) {
    reserved[8][i] = true;
  }
  for (let i = size - 7; i < size; i++) {
    reserved[i][8] = true;
  }

  // 6. Điền dữ liệu theo luồng zic-zac
  let bitIdx = 0;
  const bitArray: boolean[] = [];
  for (const b of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      bitArray.push(((b >>> i) & 1) === 1);
    }
  }

  let right = size - 1;
  let upward = true;

  while (right > 0) {
    if (right === 6) right--; // Bỏ qua cột timing

    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!reserved[r][c]) {
          const bit = bitIdx < bitArray.length ? bitArray[bitIdx++] : false;
          // Áp dụng mặt nạ mask 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = mask ? !bit : bit;
        }
      }
    }
    right -= 2;
    upward = !upward;
  }

  // 7. Format bits (Mask 0, ECC M: 00 + 000 = format 00000 -> sau BCH & XOR: 101010000010010)
  // Format code cho ECC M (00) và Mask 0 (000): 101010000010010
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  const fPos1: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = fPos1[i];
    matrix[r][c] = formatBits[i] === 1;
  }

  const fPos2: [number, number][] = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = fPos2[i];
    matrix[r][c] = formatBits[i] === 1;
  }

  // Chuyển matrix sang boolean thuần
  return matrix.map((row) => row.map((cell) => cell === true));
}

export interface QrOptions {
  size?: number;
  margin?: number;
  color?: string;
  bgColor?: string;
}

/**
 * Sinh chuỗi SVG vector sắc nét cho mã QR Code
 */
export function generateQrSvg(text: string, options?: QrOptions): string {
  const matrix = createQrMatrix(text || 'EMPTY');
  const matrixSize = matrix.length;
  const margin = options?.margin ?? 2;
  const totalSize = matrixSize + margin * 2;
  const size = options?.size ?? 200;
  const color = options?.color ?? '#0f172a';
  const bgColor = options?.bgColor ?? '#ffffff';

  let pathData = '';
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c]) {
        pathData += `M${c + margin},${r + margin}h1v1h-1z `;
      }
    }
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
      <rect width="100%" height="100%" fill="${bgColor}"/>
      <path d="${pathData.trim()}" fill="${color}"/>
    </svg>
  `.trim();
}

/**
 * Sinh chuỗi Data URL SVG có thể dùng trực tiếp trong thẻ `<img src="..." />`
 */
export function generateQrDataUrl(text: string, options?: QrOptions): string {
  const svg = generateQrSvg(text, options);
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}
