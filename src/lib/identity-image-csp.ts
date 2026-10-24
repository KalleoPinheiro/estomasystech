/**
 * CSP da entrega de logo e avatar (#427). O SVG é servido como imagem isolada:
 * sem `sandbox`, abri-lo direto numa aba rodaria o que o sanitizador deixasse
 * passar. A exibição na página é só por `<img>`.
 */
export const IDENTITY_IMAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; sandbox";
