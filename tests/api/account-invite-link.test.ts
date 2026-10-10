import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import {
  clearEmailChannels,
  providerCalls,
  saveEmailChannel,
  stubProviderFetch,
} from '../support/email-channel';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.vitta.test';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface LinkDto {
  id?: string;
  delivered: boolean;
  inviteUrl: string | null;
}

const LINK = /^https:\/\/app\.vitta\.test\/definir-senha\?token=[\w-]+$/;
const ADMIN = cookieHeaderFor(
  'company_admin',
  'admin-link@a.test',
  CLINIC_A_ID,
);

let seq = 0;
const nextEmail = () => `convite-link-${++seq}@a.test`;

const create = async (email: string) => {
  const route = await import('@/app/api/accounts/route');
  const response = await route.POST(
    jsonRequest('/api/accounts', 'POST', { email, role: 'atendente' }, ADMIN),
  );
  return { response, json: (await response.json()) as Envelope<LinkDto> };
};

const resend = async (id: string) => {
  const route = await import('@/app/api/accounts/[id]/resend-invite/route');
  const response = await route.POST(
    jsonRequest(`/api/accounts/${id}/resend-invite`, 'POST', undefined, ADMIN),
    { params: Promise.resolve({ id }) },
  );
  return { response, json: (await response.json()) as Envelope<LinkDto> };
};

/**
 * C2 (#265): convite e reenvio feitos pelo admin saem pelo canal da clínica;
 * quando o e-mail não sai, o link volta na resposta — e só então.
 */
describe('Feature: link de convite quando o e-mail não sai', () => {
  beforeAll(async () => {
    await ensureTestClinics();
  });

  beforeEach(async () => {
    await clearEmailChannels();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sem canal: criar e reenviar respondem delivered false com o link, sem chamar o provedor', async () => {
    const fetchMock = stubProviderFetch(200);

    const created = await create(nextEmail());
    const resent = await resend(created.json.data.id ?? '');

    for (const { response, json } of [created, resent]) {
      expect(response.status).toBe(200);
      expect(json.data.delivered).toBe(false);
      expect(json.data.inviteUrl).toMatch(LINK);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com canal: criar e reenviar saem pela chave da clínica, delivered true e inviteUrl null', async () => {
    await saveEmailChannel(CLINIC_A_ID, 're_chave_da_A');
    const fetchMock = stubProviderFetch(200);
    const email = nextEmail();

    const created = await create(email);
    const resent = await resend(created.json.data.id ?? '');

    for (const { response, json } of [created, resent]) {
      expect(response.status).toBe(200);
      expect(json.data).toMatchObject({ delivered: true, inviteUrl: null });
    }
    const calls = providerCalls(fetchMock);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.auth).toBe('Bearer re_chave_da_A');
      expect(call.to).toBe(email);
      expect(call.text).toMatch(/definir-senha\?token=/);
    }
  });

  it('canal falha: não-2xx do provedor responde delivered false com o link, e a conta continua criada', async () => {
    await saveEmailChannel(CLINIC_A_ID, 're_chave_da_A');
    stubProviderFetch(500);
    const email = nextEmail();

    const created = await create(email);
    const resent = await resend(created.json.data.id ?? '');

    for (const { response, json } of [created, resent]) {
      expect(response.status).toBe(200);
      expect(json.data.delivered).toBe(false);
      expect(json.data.inviteUrl).toMatch(LINK);
    }
    const { getRepositories } = await import('@/infrastructure/container');
    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    const [stored] = await userAccounts.findAllByEmail(email);
    expect(stored?.id).toBe(created.json.data.id);
  });
});
