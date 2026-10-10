import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ClinicChannel } from '@/domain/clinic/clinic-channel';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { ensureClinic } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface EmailChannel {
  configured: boolean;
  provider: 'resend' | null;
  lastStatus: 'ok' | 'failed' | null;
  lastStatusAt: string | null;
}

type WithChannel = { id: string; emailChannel: EmailChannel };

const SUPER_ADMIN = cookieHeaderFor('super_admin', 'dono@vitta.app', null);
const API_KEY = 're_chave_secreta_W9x2';
const SENDER = 'Clínica Status <contato@status.test>';
const PROVIDER_ERROR = 'domínio status.test não verificado';
const TESTED_AT = new Date('2026-10-09T14:30:00.000Z');

const NO_CHANNEL: EmailChannel = {
  configured: false,
  provider: null,
  lastStatus: null,
  lastStatusAt: null,
};

let seq = 0;
const freshClinic = () => ensureClinic(`canal-status-${++seq}`);

type TestOutcome = 'none' | { ok: true } | { ok: false; error: string };

/** Grava o canal da clínica como a C3 grava: salvo e, opcionalmente, testado. */
async function saveChannel(clinicId: string, outcome: TestOutcome) {
  const { getRepositories } = await import('@/infrastructure/container');
  const { clinicChannels } = await getRepositories(clinicScope(clinicId));
  const channel = ClinicChannel.configure({
    clinicId,
    channel: 'email',
    provider: 'resend',
    sender: SENDER,
    apiKey: API_KEY,
    by: 'admin@status.test',
  });
  await clinicChannels.save(
    outcome === 'none' ? channel : channel.recordTest(outcome, TESTED_AT),
  );
}

async function list() {
  const route = await import('@/app/api/platform/clinics/route');
  const response = await route.GET(
    jsonRequest('/api/platform/clinics', 'GET', undefined, SUPER_ADMIN),
  );
  const text = await response.text();
  return {
    response,
    text,
    rows: (JSON.parse(text) as Envelope<WithChannel[]>).data,
  };
}

async function detail(id: string) {
  const route = await import('@/app/api/platform/clinics/[id]/route');
  const response = await route.GET(
    jsonRequest(`/api/platform/clinics/${id}`, 'GET', undefined, SUPER_ADMIN),
    { params: Promise.resolve({ id }) },
  );
  const text = await response.text();
  return {
    response,
    text,
    clinic: (JSON.parse(text) as Envelope<WithChannel>).data,
  };
}

const channelOf = (rows: WithChannel[], id: string) =>
  rows.find((row) => row.id === id)?.emailChannel;

/**
 * C4 (#267): a plataforma vê se cada clínica tem canal de e-mail e como foi o
 * último teste — nunca remetente, último erro ou chave.
 */
describe('Feature: status do canal de e-mail na plataforma', () => {
  it('lista: cada clínica traz emailChannel sem canal, não testado, ok e falho', async () => {
    const none = await freshClinic();
    const untested = await freshClinic();
    const ok = await freshClinic();
    const failed = await freshClinic();
    await saveChannel(untested, 'none');
    await saveChannel(ok, { ok: true });
    await saveChannel(failed, { ok: false, error: PROVIDER_ERROR });

    const { response, rows } = await list();

    expect(response.status).toBe(200);
    expect(channelOf(rows, none)).toEqual(NO_CHANNEL);
    expect(channelOf(rows, untested)).toEqual({
      configured: true,
      provider: 'resend',
      lastStatus: null,
      lastStatusAt: null,
    });
    expect(channelOf(rows, ok)).toEqual({
      configured: true,
      provider: 'resend',
      lastStatus: 'ok',
      lastStatusAt: '2026-10-09T14:30:00.000Z',
    });
    expect(channelOf(rows, failed)).toEqual({
      configured: true,
      provider: 'resend',
      lastStatus: 'failed',
      lastStatusAt: '2026-10-09T14:30:00.000Z',
    });
  });

  it('detalhe: GET [id] traz o mesmo emailChannel, sem canal e com teste falho', async () => {
    const none = await freshClinic();
    const failed = await freshClinic();
    await saveChannel(failed, { ok: false, error: PROVIDER_ERROR });

    const withoutChannel = await detail(none);
    const failing = await detail(failed);

    expect(withoutChannel.response.status).toBe(200);
    expect(withoutChannel.clinic.emailChannel).toEqual(NO_CHANNEL);
    expect(failing.response.status).toBe(200);
    expect(failing.clinic.emailChannel).toEqual({
      configured: true,
      provider: 'resend',
      lastStatus: 'failed',
      lastStatusAt: '2026-10-09T14:30:00.000Z',
    });
  });

  it('nunca expõe remetente, últimos 4, último erro nem a chave', async () => {
    const failed = await freshClinic();
    await saveChannel(failed, { ok: false, error: PROVIDER_ERROR });

    const bodies = [(await list()).text, (await detail(failed)).text];

    for (const body of bodies) {
      for (const field of ['"sender"', '"secretLast4"', '"lastError"']) {
        expect(body).not.toContain(field);
      }
      for (const secret of [
        SENDER,
        API_KEY,
        API_KEY.slice(-4),
        PROVIDER_ERROR,
      ]) {
        expect(body).not.toContain(secret);
      }
    }
  });

  it('chave indecifrável: lista e detalhe respondem 200 com configured true', async () => {
    const broken = await freshClinic();
    await saveChannel(broken, { ok: true });
    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    const schema = await import('@/infrastructure/persistence/drizzle/schema');
    await (await getDb())
      .update(schema.clinicChannels)
      // Formato cifrado válido com um id de chave desconhecido: `decrypt` lança.
      .set({
        encryptedSecret:
          'v1.deadbeef.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AAAA',
      })
      .where(eq(schema.clinicChannels.clinicId, broken));

    const listed = await list();
    const detailed = await detail(broken);

    expect(listed.response.status).toBe(200);
    expect(channelOf(listed.rows, broken)?.configured).toBe(true);
    expect(detailed.response.status).toBe(200);
    expect(detailed.clinic.emailChannel.configured).toBe(true);
  });
});
