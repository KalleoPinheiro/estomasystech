import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { EmailChannelDto } from '@/lib/dto';
import { ensureClinic } from '../support/clinics';
import { saveEmailChannel, stubProviderFetch } from '../support/email-channel';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface TestResult {
  lastStatus: 'ok' | 'failed' | null;
  lastStatusAt: string | null;
  lastError: string | null;
}

const URL = '/api/settings/email-channel/test';
const SUBJECT = 'VittaFlow — teste do canal de e-mail';

let seq = 0;
/** Clínica nova por teste: o limite de taxa do teste é por clínica. */
const freshClinic = () => ensureClinic(`canal-teste-${++seq}`);

const adminEmail = (clinicId: string) => `admin@${clinicId}.test`;
const adminOf = (clinicId: string) =>
  cookieHeaderFor('company_admin', adminEmail(clinicId), clinicId);

async function sendTest(headers: Record<string, string>) {
  const route = await import('@/app/api/settings/email-channel/test/route');
  const response = await route.POST(
    jsonRequest(URL, 'POST', undefined, headers),
  );
  return { response, json: (await response.json()) as Envelope<TestResult> };
}

async function readChannel(headers: Record<string, string>) {
  const route = await import('@/app/api/settings/email-channel/route');
  const response = await route.GET(
    jsonRequest('/api/settings/email-channel', 'GET', undefined, headers),
  );
  return ((await response.json()) as Envelope<{ channel: EmailChannelDto }>)
    .data.channel;
}

const auditOf = async (clinicId: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  const { auditEvents, clinicChannels } = await getRepositories(
    clinicScope(clinicId),
  );
  return {
    events: await auditEvents.findAll({ resourceType: 'clinic_channel' }),
    channelId: (await clinicChannels.find('email'))?.id,
  };
};

/** Provedor que recusa com o corpo dado (ex.: domínio não verificado). */
function stubProviderRejection(status: number, body: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * C3 (#266): o e-mail de teste prova a chave e o domínio do canal da clínica
 * antes de um envio real, e grava o resultado.
 */
describe('Feature: POST /api/settings/email-channel/test', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('teste ok: envia pelo canal da clínica para o e-mail da sessão e grava lastStatus ok', async () => {
    const clinicId = await freshClinic();
    await saveEmailChannel(clinicId, 're_chave_da_clinica');
    const fetchMock = stubProviderFetch(200);
    const before = Date.now();

    const { response, json } = await sendTest(adminOf(clinicId));

    expect(response.status).toBe(200);
    expect(json.data).toEqual({
      lastStatus: 'ok',
      lastStatusAt: expect.any(String),
      lastError: null,
    });
    const at = Date.parse(json.data.lastStatusAt ?? '');
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      to: string[];
      subject: string;
      from: string;
    };
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer re_chave_da_clinica',
    );
    expect(body.to).toEqual([adminEmail(clinicId)]);
    expect(body.subject).toBe(SUBJECT);
    expect(body.from).toBe(`Clínica <contato@${clinicId}.test>`);
    expect(await readChannel(adminOf(clinicId))).toMatchObject({
      lastStatus: 'ok',
      lastStatusAt: json.data.lastStatusAt,
      lastError: null,
    });
  });

  it('provedor recusa: 200 com lastStatus failed e lastError ≤ 300 caracteres, com a mensagem e sem o destinatário', async () => {
    const clinicId = await freshClinic();
    await saveEmailChannel(clinicId, 're_chave_da_clinica');
    const providerMessage = `The clinicax.com.br domain is not verified. Recipient ${adminEmail(clinicId)} rejected. ${'x'.repeat(400)}`;
    stubProviderRejection(
      403,
      JSON.stringify({ statusCode: 403, message: providerMessage }),
    );

    const { response, json } = await sendTest(adminOf(clinicId));

    expect(response.status).toBe(200);
    expect(json.data.lastStatus).toBe('failed');
    expect(json.data.lastError).toContain('domain is not verified');
    expect(json.data.lastError?.length).toBeLessThanOrEqual(300);
    expect(json.data.lastError).not.toContain(adminEmail(clinicId));
    expect(await readChannel(adminOf(clinicId))).toMatchObject({
      lastStatus: 'failed',
      lastError: json.data.lastError,
    });
  });

  it('sem canal: 409 "Configure o canal antes de testar"', async () => {
    const clinicId = await freshClinic();
    const fetchMock = stubProviderFetch(200);

    const { response, json } = await sendTest(adminOf(clinicId));

    expect(response.status).toBe(409);
    expect(json.error).toBe('Configure o canal antes de testar');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('limite: a 6ª chamada em 60 s na mesma clínica responde 429', async () => {
    const clinicId = await freshClinic();
    await saveEmailChannel(clinicId, 're_chave_da_clinica');
    stubProviderFetch(200);
    // Outro admin da mesma clínica conta no mesmo limite.
    const other = cookieHeaderFor('company_admin', 'outro@x.test', clinicId);

    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push(
        (await sendTest(i % 2 ? other : adminOf(clinicId))).response.status,
      );
    }
    statuses.push((await sendTest(other)).response.status);

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('auditoria: teste ok grava update + test-ok; teste falho grava update + test-failed', async () => {
    const clinicId = await freshClinic();
    await saveEmailChannel(clinicId, 're_chave_da_clinica');

    stubProviderFetch(200);
    await sendTest(adminOf(clinicId));
    stubProviderRejection(403, '{"message":"domain is not verified"}');
    await sendTest(adminOf(clinicId));

    const { events, channelId } = await auditOf(clinicId);
    expect(channelId).toBeDefined();
    expect(
      events
        .map((event) => ({
          action: event.action,
          resourceId: event.resourceId,
          detail: event.detail,
          clinicId: event.clinicId,
        }))
        .sort((a, b) => String(a.detail).localeCompare(String(b.detail))),
    ).toEqual([
      {
        action: 'update',
        resourceId: channelId,
        detail: 'test-failed',
        clinicId,
      },
      { action: 'update', resourceId: channelId, detail: 'test-ok', clinicId },
    ]);
  });

  it('sem AUTH_SECRET (mesmo com VITTA_ALLOW_OPEN_MODE, removida em #327): 503, nada é enviado', async () => {
    vi.stubEnv('AUTH_SECRET', '');
    vi.stubEnv('VITTA_ALLOW_OPEN_MODE', 'true');
    const fetchMock = stubProviderFetch(200);
    try {
      const route = await import('@/app/api/settings/email-channel/test/route');
      const response = await route.POST(
        new NextRequest(`http://localhost${URL}`, { method: 'POST' }),
      );
      const json = (await response.json()) as Envelope<TestResult>;

      expect(response.status).toBe(503);
      expect(json.error).toMatch(/Autenticação não configurada/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
