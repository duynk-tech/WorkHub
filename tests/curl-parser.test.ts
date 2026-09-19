import { describe, it, expect } from 'vitest';
import { parseCurlCommand } from '@/lib/curl-parser';

describe('parseCurlCommand', () => {
  it('should parse simple GET cURL', () => {
    const input = 'curl https://api.example.com/orders';
    const res = parseCurlCommand(input);
    expect(res).not.toBeNull();
    expect(res?.method).toBe('GET');
    expect(res?.url).toBe('https://api.example.com/orders');
    expect(res?.headers).toEqual({});
    expect(res?.body).toBe('');
    expect(res?.suggestedName).toBe('orders');
  });

  it('should parse POST cURL with headers and raw JSON body', () => {
    const input = `curl -X POST 'https://api.crm.vn/customers/lookup?phone=0912345678' \\
      -H 'Authorization: Bearer token123' \\
      -H 'Content-Type: application/json' \\
      --data-raw '{"region":"hanoi","limit":10}'`;

    const res = parseCurlCommand(input);
    expect(res).not.toBeNull();
    expect(res?.method).toBe('POST');
    expect(res?.url).toBe('https://api.crm.vn/customers/lookup?phone=0912345678');
    expect(res?.headers['Authorization']).toBe('Bearer token123');
    expect(res?.headers['Content-Type']).toBe('application/json');
    expect(res?.suggestedName).toBe('customers_lookup');

    // Check suggested parameters extracted from query and body
    const paramNames = res?.suggestedParams.map((p) => p.name);
    expect(paramNames).toContain('phone');
    expect(paramNames).toContain('region');
    expect(paramNames).toContain('limit');

    // Check URL with placeholder
    expect(res?.urlWithPlaceholders).toContain('phone={{phone}}');
  });

  it('should infer POST method when body is provided without explicit -X', () => {
    const input = `curl https://api.example.com/messages -d '{"text":"hello"}'`;
    const res = parseCurlCommand(input);
    expect(res?.method).toBe('POST');
    expect(res?.url).toBe('https://api.example.com/messages');
  });

  it('should return null for empty or invalid input', () => {
    expect(parseCurlCommand('')).toBeNull();
    expect(parseCurlCommand('   ')).toBeNull();
  });
});
