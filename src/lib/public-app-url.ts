/** `APP_URL` só se for http(s) válida; sem barra final. Inválida/ausente: sem link. */
export function publicAppUrl(): string | null {
  const raw = process.env.APP_URL;
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
