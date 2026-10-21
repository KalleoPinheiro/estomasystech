import type { PhotoStorage } from '@/application/ports/photo-storage';
import {
  IDENTITY_CONTENT_TYPES,
  identityFormatOf,
} from '@/domain/clinic/identity-image';
import { fail } from '@/lib/api-response';
import { IDENTITY_IMAGE_CSP } from '@/lib/identity-image-csp';

const NOT_FOUND = 'Imagem não encontrada';

export async function identityImageResponse(
  request: Request,
  storage: PhotoStorage,
  key: string | null,
): Promise<Response> {
  const format = key ? identityFormatOf(key) : null;
  if (!key || !format) return fail(NOT_FOUND, 404);
  const data = await storage.read(key);
  if (!data) return fail(NOT_FOUND, 404);

  // A chave é única por envio: serve de validador (ETag forte).
  const etag = `"${key}"`;
  const headers = {
    ETag: etag,
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': IDENTITY_IMAGE_CSP,
  };
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      ...headers,
      'Content-Type': IDENTITY_CONTENT_TYPES[format],
      'Content-Length': String(data.byteLength),
    },
  });
}
