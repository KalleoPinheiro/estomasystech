import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEmailGateway } from '@/application/ports/email-gateway';
import {
  EMAIL_PROVIDER_GATEWAYS,
  platformEmailGateway,
  ResendEmailGateway,
  resendConfigFromEnv,
} from '@/infrastructure/email/resend-email-gateway';

/**
 * Gateway do Resend. Desde o ADR-011, RESEND_API_KEY/EMAIL_FROM são o canal
 * opcional da plataforma (só contas sem clínica): sem eles o gateway é o nulo,
 * inclusive em produção — o AUTH-02 (falha no boot) foi substituído.
 */
describe('Feature: Gateway de e-mail transacional (Resend)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  describe('Cenário: enviar e-mail', () => {
    it('Dado envio bem-sucedido, Quando send, Então chama a API do Resend com URL, headers e corpo corretos', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      const gateway = new ResendEmailGateway({
        apiKey: 're_123',
        from: 'EstomaSysTech <no@v.com>',
      });

      await gateway.send({
        to: 'p@c.com',
        subject: 'Defina sua senha',
        text: 'link aqui',
      });

      expect(await gateway.isEnabled()).toBe(true);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.resend.com/emails');
      expect(options.method).toBe('POST');
      expect(options.headers).toMatchObject({
        Authorization: 'Bearer re_123',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(options.body as string)).toEqual({
        from: 'EstomaSysTech <no@v.com>',
        to: ['p@c.com'],
        subject: 'Defina sua senha',
        text: 'link aqui',
      });
    });

    it('Dado resposta de erro da API, Quando send, Então lança Error contendo o status', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 422,
          text: () => Promise.resolve('invalid from'),
        }),
      );
      const gateway = new ResendEmailGateway({
        apiKey: 're_123',
        from: 'no@v.com',
      });

      await expect(
        gateway.send({ to: 'p@c.com', subject: 's', text: 't' }),
      ).rejects.toThrow('Resend API 422: invalid from');
    });

    it('Dado falha ao ler o corpo do erro, Quando send, Então ainda lança Error com o status', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.reject(new Error('stream')),
        }),
      );
      const gateway = new ResendEmailGateway({
        apiKey: 're_123',
        from: 'no@v.com',
      });

      await expect(
        gateway.send({ to: 'p@c.com', subject: 's', text: 't' }),
      ).rejects.toThrow('Resend API 500:');
    });
  });

  describe('Cenário: montar configuração a partir do ambiente', () => {
    it('Dado RESEND_API_KEY e EMAIL_FROM definidos, Quando ler do ambiente, Então retorna a config', () => {
      process.env.RESEND_API_KEY = 're_abc';
      process.env.EMAIL_FROM = 'clinica@v.com';

      expect(resendConfigFromEnv()).toEqual({
        apiKey: 're_abc',
        from: 'clinica@v.com',
      });
    });

    it('Dado RESEND_API_KEY ausente, Quando ler do ambiente, Então retorna null', () => {
      delete process.env.RESEND_API_KEY;
      process.env.EMAIL_FROM = 'clinica@v.com';

      expect(resendConfigFromEnv()).toBeNull();
    });

    it('Dado EMAIL_FROM ausente, Quando ler do ambiente, Então retorna null', () => {
      process.env.RESEND_API_KEY = 're_abc';
      delete process.env.EMAIL_FROM;

      expect(resendConfigFromEnv()).toBeNull();
    });
  });

  describe('Cenário: canal da plataforma conforme o ambiente (ADR-011)', () => {
    it('Dado credenciais presentes, Quando montar o canal da plataforma, Então devolve o gateway real habilitado', async () => {
      process.env.RESEND_API_KEY = 're_abc';
      process.env.EMAIL_FROM = 'clinica@v.com';

      const gateway = platformEmailGateway();

      expect(gateway).toBeInstanceOf(ResendEmailGateway);
      expect(await gateway.isEnabled()).toBe(true);
    });

    it('Dado produção sem credenciais, Quando montar o canal da plataforma, Então não lança e devolve canal desativado', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;

      const gateway = platformEmailGateway();

      expect(gateway).toBeInstanceOf(NullEmailGateway);
      expect(await gateway.isEnabled()).toBe(false);
    });

    it('Dado ambiente fora de produção sem credenciais, Quando montar o canal da plataforma, Então devolve o gateway nulo (dry-run)', () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;

      expect(platformEmailGateway()).toBeInstanceOf(NullEmailGateway);
    });
  });

  describe('Cenário: gateway por provedor', () => {
    it('Dado o provedor resend, Quando montar pela fábrica, Então devolve o gateway do Resend com a credencial dada', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);

      const gateway = EMAIL_PROVIDER_GATEWAYS.resend({
        apiKey: 're_clinica',
        from: 'Clínica <c@c.test>',
      });
      await gateway.send({ to: 'p@c.com', subject: 's', text: 't' });

      const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(options.headers).toMatchObject({
        Authorization: 'Bearer re_clinica',
      });
      expect(JSON.parse(options.body as string).from).toBe(
        'Clínica <c@c.test>',
      );
    });
  });
});
