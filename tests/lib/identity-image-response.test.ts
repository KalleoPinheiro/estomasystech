import { describe, expect, it } from 'vitest';
import type { PhotoStorage } from '@/application/ports/photo-storage';
import { identityImageResponse } from '@/lib/identity-image-response';

const storage = (files: Record<string, string>): PhotoStorage => ({
  write: async () => undefined,
  remove: async () => undefined,
  read: async (id) =>
    id in files ? new TextEncoder().encode(files[id]) : null,
});

const req = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/x', { headers });

describe('Feature: Entrega de logo e avatar (#427)', () => {
  it.each([null, 'foto-clinica-123', 'logo-x-png'])(
    'Dada a chave %j que não é de identidade, Quando entregar, Então 404 sem tocar no armazenamento',
    async (key) => {
      const response = await identityImageResponse(req(), storage({}), key);

      expect(response.status).toBe(404);
    },
  );

  it('Dada chave válida cujo arquivo sumiu do armazenamento, Quando entregar, Então 404', async () => {
    const response = await identityImageResponse(
      req(),
      storage({}),
      'logo-abc-webp',
    );

    expect(response.status).toBe(404);
  });

  it('Dado um SVG guardado, Quando entregar, Então tipo, nosniff, CSP sandbox e ETag da chave', async () => {
    const response = await identityImageResponse(
      req(),
      storage({ 'avatar-abc-svg': '<svg/>' }),
      'avatar-abc-svg',
    );

    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain(
      'sandbox',
    );
    expect(response.headers.get('etag')).toBe('"avatar-abc-svg"');
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    expect(await response.text()).toBe('<svg/>');
  });

  it('Dado o ETag atual, Quando o navegador revalidar, Então 304 sem corpo e com os mesmos cabeçalhos de segurança', async () => {
    const response = await identityImageResponse(
      req({ 'if-none-match': '"logo-abc-webp"' }),
      storage({ 'logo-abc-webp': 'x' }),
      'logo-abc-webp',
    );

    expect(response.status).toBe(304);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
