import { describe, expect, it } from 'vitest';
import { normalizeRoute, roundWidth, WEB_VITAL_NAMES } from '@/lib/web-vitals';
import { webVitalsPayloadSchema } from '@/lib/web-vitals-schema';

describe('Feature: rota dos Web Vitals de campo sem identidade (#559)', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['/agenda', '/agenda'],
    ['/care-plan-interventions', '/care-plan-interventions'],
    ['/pacientes/3f2504e0-4f89-41d3-9a0c-0305e82c3301', '/pacientes/:id'],
    ['/pacientes/42/avaliacoes', '/pacientes/:id/avaliacoes'],
    ['/portal/convite/abc123def456ghi789jk', '/portal/convite/:id'],
    ['/x/0123456789abcdef0123', '/x/:id'],
    ['/pacientes?nome=Maria#topo', '/pacientes'],
    ['/pacientes/Maria Souza', '/pacientes/:id'],
    ['/pacientes/joão@x.com', '/pacientes/:id'],
  ])('Dada a rota %s, Quando normaliza, Então %s', (input, expected) => {
    expect(normalizeRoute(input)).toBe(expected);
  });

  it('Dada uma rota muito funda, Quando normaliza, Então fica em 8 segmentos', () => {
    expect(normalizeRoute('/a/b/c/d/e/f/g/h/i/j')).toBe('/a/b/c/d/e/f/g/h');
  });

  it('Dada uma rota muito longa, Quando normaliza, Então não passa de 120 caracteres', () => {
    const long = `/${'z'.repeat(300)}`;
    expect(normalizeRoute(long).length).toBe(120);
  });
});

describe('Feature: largura da janela arredondada (#559)', () => {
  it.each([
    [360, 350],
    [390, 400],
    [768, 750],
    [1280, 1300],
    [0, 0],
    [-5, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [99_999, 10_000],
  ])('Dada a largura %s, Quando arredonda, Então %s', (width, expected) => {
    expect(roundWidth(width)).toBe(expected);
  });
});

describe('Feature: corpo dos Web Vitals de campo (#559)', () => {
  const valid = {
    route: '/agenda',
    width: 390,
    metrics: [{ name: 'LCP', value: 1200.5, rating: 'good' }],
  };

  it('Dado um corpo completo, Quando valida, Então aceita', () => {
    expect(webVitalsPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it('Dada uma métrica sem rating, Quando valida, Então aceita', () => {
    const parsed = webVitalsPayloadSchema.safeParse({
      ...valid,
      metrics: [{ name: 'CLS', value: 0 }],
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ['métrica desconhecida', { metrics: [{ name: 'FID', value: 1 }] }],
    ['valor negativo', { metrics: [{ name: 'LCP', value: -1 }] }],
    ['valor infinito', { metrics: [{ name: 'LCP', value: 1e9 }] }],
    ['sem métricas', { metrics: [] }],
    [
      'campo extra na métrica',
      { metrics: [{ name: 'LCP', value: 1, id: 'x' }] },
    ],
    ['rating inválido', { metrics: [{ name: 'LCP', value: 1, rating: 'ok' }] }],
    ['campo extra no corpo', { userId: 'u1' }],
    ['rota vazia', { route: '' }],
    ['largura negativa', { width: -1 }],
  ])('Dado %s, Quando valida, Então recusa', (_label, override) => {
    expect(
      webVitalsPayloadSchema.safeParse({ ...valid, ...override }).success,
    ).toBe(false);
  });

  it('Dadas mais métricas que as cinco do catálogo, Quando valida, Então recusa', () => {
    const metrics = Array.from({ length: WEB_VITAL_NAMES.length + 1 }, () => ({
      name: 'LCP',
      value: 1,
    }));
    expect(
      webVitalsPayloadSchema.safeParse({ ...valid, metrics }).success,
    ).toBe(false);
  });
});
