/** Accept only local paths; URL parsing also catches backslash normalization. */
export function safeRedirectPath(value: unknown, fallback = '/dashboard'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const base = 'https://workhub.invalid';
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}
