import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildMockHandlers,
  MOCK_ERROR_EMAIL,
  MOCK_ERROR_S3_MARKER,
} from '@/infrastructure/mocks/handlers';

const server = setupServer(...buildMockHandlers());
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

const bucket = 'https://bucket.s3.sa-east-1.amazonaws.com';

describe('Feature: Integrações simuladas pelo MSW (ADR-041)', () => {
  describe('Cenário: Resend', () => {
    it('Dado um envio normal, Então responde 200 com id e nada sai', async () => {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        body: JSON.stringify({ to: ['paciente@example.com'] }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id: 'mock-email-id' });
    });

    it('Dado o destinatário reservado de erro, Então responde 500', async () => {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        body: JSON.stringify({ to: [MOCK_ERROR_EMAIL] }),
      });
      expect(response.status).toBe(500);
    });

    it('Dado corpo inválido, Então trata como envio normal', async () => {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        body: 'não-json',
      });
      expect(response.status).toBe(200);
    });
  });

  describe('Cenário: Google', () => {
    it('Dado a troca de token OAuth, Então devolve tokens fictícios', async () => {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
      });
      expect(await response.json()).toMatchObject({
        access_token: 'mock-access-token',
      });
    });

    it('Dado criar, atualizar e apagar evento, Então responde 200/200/204', async () => {
      const base =
        'https://www.googleapis.com/calendar/v3/calendars/primary/events';
      const created = await fetch(base, { method: 'POST' });
      expect(await created.json()).toMatchObject({ id: 'mock-event-id' });
      const patched = await fetch(`${base}/ev1`, { method: 'PATCH' });
      expect(await patched.json()).toMatchObject({ id: 'ev1' });
      const removed = await fetch(`${base}/ev1`, { method: 'DELETE' });
      expect(removed.status).toBe(204);
    });
  });

  describe('Cenário: S3/R2', () => {
    it('Dado PUT, GET e DELETE, Então guarda em memória e devolve 404 depois de apagar', async () => {
      const url = `${bucket}/clinic/foto.jpg`;
      expect((await fetch(url, { method: 'PUT', body: 'abc' })).status).toBe(
        200,
      );
      const got = await fetch(url);
      expect(await got.text()).toBe('abc');
      expect((await fetch(url, { method: 'DELETE' })).status).toBe(204);
      expect((await fetch(url)).status).toBe(404);
    });

    it('Dado chave com o marcador de erro, Então responde 403', async () => {
      const response = await fetch(
        `${bucket}/clinic/${MOCK_ERROR_S3_MARKER}.jpg`,
        {
          method: 'PUT',
          body: 'x',
        },
      );
      expect(response.status).toBe(403);
    });

    it('Dado endpoint R2, Então também é simulado', async () => {
      const response = await fetch(
        'https://abc.r2.cloudflarestorage.com/bucket/obj',
        { method: 'PUT', body: 'x' },
      );
      expect(response.status).toBe(200);
    });
  });
});
