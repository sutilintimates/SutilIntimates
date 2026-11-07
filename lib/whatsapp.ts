const WHATSAPP_HOSTS = new Set(['wa.me', 'api.whatsapp.com']);

export function normalizeWhatsappUrl(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;

  const digits = input.replace(/[\s()+-]/g, '');
  if (/^55\d{10,11}$/.test(digits)) return `https://wa.me/${digits}`;

  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!WHATSAPP_HOSTS.has(url.hostname.toLowerCase())) return null;

  url.protocol = 'https:';
  return url.toString();
}
