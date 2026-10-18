import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ResendEmailGateway,
  withPrivacyFooter,
} from '@/infrastructure/email/resend-email-gateway';

describe('Feature: Rodapé de privacidade em todo e-mail (#216, ADR-030)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('Dada APP_URL absoluta, Quando montar o rodapé, Então aponta para /privacidade', () => {
    process.env.APP_URL = 'https://app.estomasystech.test/';

    expect(withPrivacyFooter('Olá')).toBe(
      'Olá\n\n--\nAviso de privacidade: https://app.estomasystech.test/privacidade',
    );
  });

  it('Dada APP_URL ausente ou inválida, Então o texto sai como está (sem link quebrado)', () => {
    delete process.env.APP_URL;
    expect(withPrivacyFooter('Olá')).toBe('Olá');
    process.env.APP_URL = 'javascript:alert(1)';
    expect(withPrivacyFooter('Olá')).toBe('Olá');
  });

  it('Dado o envio pelo Resend, Então o corpo enviado leva o rodapé', async () => {
    process.env.APP_URL = 'https://app.estomasystech.test';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await new ResendEmailGateway({ apiKey: 're_1', from: 'a@b.c' }).send({
      to: 'p@c.com',
      subject: 'Assunto',
      text: 'Corpo',
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string).text).toBe(
      'Corpo\n\n--\nAviso de privacidade: https://app.estomasystech.test/privacidade',
    );
  });
});
