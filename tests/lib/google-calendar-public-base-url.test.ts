import { afterEach, describe, expect, it } from 'vitest';
import { publicBaseUrl } from '@/lib/auth/google-calendar-oauth';

describe('Feature: Base pública dos redirects da conexão do Google Agenda', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('Dado APP_URL definida, Quando montar o redirect, Então usa a base pública, não a URL interna', () => {
    process.env.APP_URL = 'https://app.estomasystech.test';
    expect(publicBaseUrl('http://localhost:3000/api/x')).toBe(
      'https://app.estomasystech.test',
    );
  });

  it('Dado APP_URL ausente, Quando montar o redirect, Então cai na URL da requisição', () => {
    delete process.env.APP_URL;
    expect(publicBaseUrl('http://localhost:3000/api/x')).toBe(
      'http://localhost:3000/api/x',
    );
  });
});
