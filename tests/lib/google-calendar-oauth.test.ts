import { afterEach, describe, expect, it } from 'vitest';
import {
  CALENDAR_CALLBACK_PATH,
  GOOGLE_CALENDAR_SCOPES,
  googleCalendarOAuthConfigFromEnv,
} from '@/lib/auth/google-calendar-oauth';

/**
 * AUTH-15: a conexão da agenda tem config própria, sem allowlist, e pede
 * apenas o escopo de eventos de calendário.
 */
describe('Feature: Configuração de OAuth do Google Agenda', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const setCredentials = () => {
    process.env.GOOGLE_CLIENT_ID = 'client-abc';
    process.env.GOOGLE_CLIENT_SECRET = 'secret-xyz';
    process.env.APP_URL = 'https://app.estomasystech.test';
  };

  it('Dado o escopo declarado, Quando ler, Então é exatamente o de eventos de calendário (sem identidade)', () => {
    expect(GOOGLE_CALENDAR_SCOPES).toEqual([
      'https://www.googleapis.com/auth/calendar.events',
    ]);
  });

  it('Dado client id, secret e APP_URL, Quando ler do ambiente, Então monta o redirect da rota de integração', () => {
    setCredentials();

    expect(googleCalendarOAuthConfigFromEnv()).toEqual({
      clientId: 'client-abc',
      clientSecret: 'secret-xyz',
      redirectUri: `https://app.estomasystech.test${CALENDAR_CALLBACK_PATH}`,
    });
  });

  it('Dado APP_URL com barra final, Quando ler do ambiente, Então o redirect não duplica a barra', () => {
    setCredentials();
    process.env.APP_URL = 'https://app.estomasystech.test/';

    expect(googleCalendarOAuthConfigFromEnv()?.redirectUri).toBe(
      `https://app.estomasystech.test${CALENDAR_CALLBACK_PATH}`,
    );
  });

  it('Dado GOOGLE_ALLOWED_EMAILS ausente, Quando ler do ambiente, Então ainda monta a config (allowlist não participa mais)', () => {
    setCredentials();
    delete process.env.GOOGLE_ALLOWED_EMAILS;

    expect(googleCalendarOAuthConfigFromEnv()).not.toBeNull();
  });

  it('Dado GOOGLE_CLIENT_ID ausente, Quando ler do ambiente, Então retorna null', () => {
    setCredentials();
    delete process.env.GOOGLE_CLIENT_ID;

    expect(googleCalendarOAuthConfigFromEnv()).toBeNull();
  });

  it('Dado GOOGLE_CLIENT_SECRET ausente, Quando ler do ambiente, Então retorna null', () => {
    setCredentials();
    delete process.env.GOOGLE_CLIENT_SECRET;

    expect(googleCalendarOAuthConfigFromEnv()).toBeNull();
  });

  it('Dado APP_URL ausente, Quando ler do ambiente, Então retorna null', () => {
    setCredentials();
    delete process.env.APP_URL;

    expect(googleCalendarOAuthConfigFromEnv()).toBeNull();
  });
});
