import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';
import { sanitizeSvg } from './svg-sanitizer';

/**
 * Imagem de identidade (#427): logo da clínica e avatar da equipe. Entram
 * PNG, JPEG, WebP, GIF, AVIF e SVG; todo raster é recodificado em WebP no
 * servidor (sem EXIF, sem GPS) e o SVG é reconstruído pelo sanitizador.
 */

/** Teto do arquivo guardado, depois da conversão. */
export const MAX_IDENTITY_IMAGE_BYTES = 1024 * 1024;
/** Teto do arquivo recebido (cabe no corpo que o proxy aceita). */
export const MAX_IDENTITY_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Lado maior do raster guardado, em pixels. */
export const IDENTITY_IMAGE_MAX_SIDE = 512;

export type IdentityImageKind = 'logo' | 'avatar';
export type IdentityImageFormat = 'webp' | 'svg';

export const IDENTITY_CONTENT_TYPES: Record<IdentityImageFormat, string> = {
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export const HEIC_UNSUPPORTED_MESSAGE =
  'HEIC não é aceito aqui. No iPhone, escolha a foto pela galeria (ela converte para JPEG) ou exporte como JPEG ou PNG';

export type DetectedImage =
  | { type: 'raster' }
  | { type: 'heic' }
  | { type: 'svg'; text: string };

const startsWith = (data: Uint8Array, bytes: number[], offset = 0): boolean =>
  bytes.every((byte, index) => data[offset + index] === byte);

const ascii = (data: Uint8Array, start: number, end: number): string =>
  String.fromCharCode(...data.subarray(start, end));

const HEIC_BRANDS = [
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'mif1',
  'msf1',
];
const AVIF_BRANDS = ['avif', 'avis'];

function isRaster(data: Uint8Array): boolean {
  return (
    startsWith(data, [0xff, 0xd8, 0xff]) ||
    startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WEBP') ||
    ascii(data, 0, 6) === 'GIF87a' ||
    ascii(data, 0, 6) === 'GIF89a'
  );
}

/** Tipo real pelos bytes — o `Content-Type` declarado pelo cliente é ignorado. */
export function detectIdentityImage(data: Uint8Array): DetectedImage {
  if (isRaster(data)) return { type: 'raster' };
  if (ascii(data, 4, 8) === 'ftyp') {
    const brand = ascii(data, 8, 12);
    if (AVIF_BRANDS.includes(brand)) return { type: 'raster' };
    if (HEIC_BRANDS.includes(brand)) return { type: 'heic' };
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    throw invalidFormat();
  }
  if (SVG_PROLOG.test(text)) {
    return { type: 'svg', text };
  }
  throw invalidFormat();
}

/** Prólogo permitido antes de `<svg`: BOM, espaço, `<?xml?>`, comentário e DOCTYPE. */
const SVG_PROLOG =
  /^(?:\uFEFF|\s|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*<svg[\s/>]/i;

const invalidFormat = () =>
  new ValidationError(
    'Formato de imagem não suportado (use PNG, JPEG, WebP, GIF, AVIF ou SVG)',
  );

/** SVG limpo, em bytes, dentro do teto; lança `ValidationError` se malicioso ou grande. */
export function prepareSvg(text: string): Uint8Array {
  const clean = new TextEncoder().encode(sanitizeSvg(text));
  assertWithinLimit(clean);
  return clean;
}

export function assertWithinLimit(data: Uint8Array): void {
  if (data.byteLength > MAX_IDENTITY_IMAGE_BYTES) {
    throw new ValidationError('Imagem excede o limite de 1 MB');
  }
}

/** Chave no storage: `logo-<uuid>-webp`. O formato vai na chave; sem coluna a mais. */
export const newIdentityKey = (
  kind: IdentityImageKind,
  format: IdentityImageFormat,
): string => `${kind}-${newId()}-${format}`;

/** Formato guardado sob a chave, ou `null` se a chave não é de identidade. */
export function identityFormatOf(key: string): IdentityImageFormat | null {
  if (/^(logo|avatar)-[A-Za-z0-9-]+-webp$/.test(key)) return 'webp';
  if (/^(logo|avatar)-[A-Za-z0-9-]+-svg$/.test(key)) return 'svg';
  return null;
}
