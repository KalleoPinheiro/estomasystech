import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResendEmailGateway } from '@/infrastructure/email/resend-email-gateway';
import { logError } from '@/lib/log-error';
import { resetErrorTracker } from '@/lib/observability/error-tracker';

const DSN = 'http://chavepublica@glitchtip.test:8000/7';

describe('Feature: fetch do servidor sem cache e com prazo (#559)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetErrorTracker();
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetErrorTracker();
  });

  it('Dado um e-mail transacional, Quando envia pelo Resend, Então a chamada é no-store e tem prazo', async () => {
    await new ResendEmailGateway({ apiKey: 're_1', from: 'a@b.test' }).send({
      to: 'p@c.test',
      subject: 'x',
      text: 'y',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('Dado o rastreador de erros, Quando um erro é logado, Então o envio é no-store e tem prazo', async () => {
    vi.stubEnv('GLITCHTIP_DSN', DSN);

    logError('Falha', new Error('boom'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
