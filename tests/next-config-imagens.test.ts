import { matchLocalPattern } from 'next/dist/shared/lib/match-local-pattern';
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

const patterns = nextConfig.images?.localPatterns ?? [];
const allowed = (pathname: string) =>
  patterns.some((p) =>
    matchLocalPattern(p, new URL(pathname, 'http://localhost')),
  );

describe('Feature: Otimizador de imagem só para ativos públicos (#542, ADR-069)', () => {
  it('Dado o next.config, Então o otimizador aceita a logo e os ícones públicos', () => {
    expect(allowed('/brand/estomasystech.svg')).toBe(true);
    expect(allowed('/icons/qualquer.png')).toBe(true);
  });

  it.each([
    '/api/photos/abc',
    '/api/portal/photos/abc',
    '/api/clinic/logo',
    '/qualquer-outra-rota.png',
  ])(
    'Dado %s, Então o otimizador recusa (rota autenticada nunca entra no cache de disco)',
    (pathname) => {
      expect(patterns.length).toBeGreaterThan(0);
      expect(allowed(pathname)).toBe(false);
    },
  );
});
