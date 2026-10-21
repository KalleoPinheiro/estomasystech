/**
 * Endereço da imagem de identidade (#427). `v` é a chave gravada: troca a
 * imagem, troca o endereço, e o navegador não serve a antiga do cache.
 */
export const clinicLogoUrl = (logoKey: string | null): string | null =>
  logoKey ? `/api/clinic/logo?v=${encodeURIComponent(logoKey)}` : null;

export const accountAvatarUrl = (
  accountId: string,
  avatarKey: string | null,
): string | null =>
  avatarKey
    ? `/api/account/avatar/${accountId}?v=${encodeURIComponent(avatarKey)}`
    : null;
