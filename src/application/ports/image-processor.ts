/**
 * Recodificação de imagem raster de identidade (#427). Entra PNG, JPEG, WebP,
 * GIF ou AVIF; sai WebP sem metadados (EXIF/GPS), orientado e no tamanho de
 * exibição. Imagem corrompida ou grande demais lança `ValidationError`.
 */
export interface ImageProcessor {
  toIdentityWebp(data: Uint8Array): Promise<Uint8Array>;
}
