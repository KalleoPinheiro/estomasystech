import { DrizzleQueryError } from 'drizzle-orm/errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logError, sanitizeError } from '@/lib/log-error';
import {
  buildEvent,
  captureError,
  isErrorTrackingEnabled,
  resetErrorTracker,
  scrubEvent,
} from '@/lib/observability/error-tracker';
import { runWithRequestId } from '@/lib/observability/request-context';

const DSN = 'http://chavepublica@glitchtip.test:8000/7';

function bodyText(body: unknown): string {
  if (typeof body === 'string') return body;
  return new TextDecoder().decode(body as Uint8Array);
}

describe('Error tracking no GlitchTip (#212, OBS-07, OBS-08)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetErrorTracker();
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetErrorTracker();
  });

  it('Dado sem GLITCHTIP_DSN, Quando um erro é logado, Então nada sai do processo', async () => {
    vi.stubEnv('GLITCHTIP_DSN', '');

    logError('Falha qualquer', new Error('boom'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(isErrorTrackingEnabled()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dado DSN malformado, Quando captura, Então vira no-op sem lançar', () => {
    vi.stubEnv('GLITCHTIP_DSN', 'isto não é um dsn');

    expect(() =>
      captureError({ context: 'x', error: { name: 'Error' } }),
    ).not.toThrow();
    expect(isErrorTrackingEnabled()).toBe(false);
  });

  it('Dado DSN, Quando um erro de banco é logado, Então o evento vai ao GlitchTip sem PII', async () => {
    vi.stubEnv('GLITCHTIP_DSN', DSN);
    const error = new DrizzleQueryError(
      'insert into "patients" ("full_name", "email") values ($1, $2)',
      ['Fulano de Tal', 'fulano@x.com'],
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        severity: 'ERROR',
        table: 'patients',
      }),
    );

    runWithRequestId('req-abcdef12', () =>
      logError('Erro inesperado na API:', error),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://glitchtip.test:8000/api/7/envelope/?sentry_version=7&sentry_key=chavepublica',
    );
    const body = bodyText(init.body);
    expect(body).toContain('Erro inesperado na API:');
    expect(body).toContain('req-abcdef12');
    expect(body).toContain('23505');
    expect(body).not.toContain('fulano@x.com');
    expect(body).not.toContain('Fulano de Tal');
    expect(body).not.toContain('insert into');
    // `contexts` só some pelo beforeSend (o SDK põe `contexts.trace`).
    expect(body).not.toMatch(
      /"(request|user|breadcrumbs|server_name|contexts|extra)"/,
    );
  });

  it('Dado erro com e-mail na mensagem, Quando monta o evento, Então a mensagem sai limpa e com frames', () => {
    const safe = sanitizeError(new Error('Resend 422: fulano@x.com inválido'));

    const event = buildEvent({ context: 'Convite', error: safe });

    expect(event.exception?.values?.[0]).toMatchObject({
      type: 'Error',
      value: 'Resend 422: [e-mail] inválido',
    });
    expect(
      event.exception?.values?.[0].stacktrace?.frames?.length,
    ).toBeGreaterThan(0);
    expect(event.tags).toEqual({});
  });

  it('Dado erro só com código, Quando monta o evento, Então usa o código e as tags', () => {
    const event = buildEvent({
      context: 'Banco',
      error: { name: 'DatabaseError', code: '57P01', table: 'patients' },
      requestId: 'req-00000001',
    });

    expect(event.exception?.values?.[0].value).toBe('57P01');
    expect(event.exception?.values?.[0].stacktrace).toBeUndefined();
    expect(event.tags).toEqual({
      requestId: 'req-00000001',
      code: '57P01',
      table: 'patients',
    });
  });

  it('Dado evento com request, usuário e breadcrumbs, Quando passa no beforeSend, Então esses campos somem', () => {
    const scrubbed = scrubEvent({
      message: 'erro de maria@x.com',
      request: {
        headers: { cookie: 'vitta_session=abc' },
        data: '{"cpf":"1"}',
      },
      user: { email: 'maria@x.com' },
      breadcrumbs: [{ message: 'clique' }],
      extra: { body: 'anamnese' },
      contexts: { os: { name: 'linux' } },
      server_name: 'vps-1',
      exception: {
        values: [
          { type: 'Error', value: 'CPF 123.456.789-09' },
          { type: 'Error' },
        ],
      },
    });

    expect(scrubbed).toEqual({
      message: 'erro de [e-mail]',
      exception: {
        values: [
          { type: 'Error', value: 'CPF [número]' },
          { type: 'Error', value: undefined },
        ],
      },
    });
  });

  it('Dado o transporte falhando, Quando captura, Então não lança', async () => {
    vi.stubEnv('GLITCHTIP_DSN', DSN);
    fetchMock.mockRejectedValue(new Error('rede'));

    expect(() =>
      captureError({ context: 'x', error: { name: 'Error', message: 'm' } }),
    ).not.toThrow();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
