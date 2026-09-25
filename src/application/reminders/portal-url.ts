/**
 * Link do portal para o lembrete (PORT4-09, COM-RN-02): `<APP_URL>/portal`.
 * A mensagem vai para o paciente — valor sem esquema ou com barras extras
 * viraria link quebrado, então sem URL absoluta http(s) não há link e o texto
 * usa a orientação de contato com a clínica.
 */
export function portalUrlFromEnv(): string | null {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) {
    return null;
  }
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
  } catch {
    return null;
  }
  return `${appUrl.replace(/\/+$/, '')}/portal`;
}
