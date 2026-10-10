import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@/domain/auth/user-role';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { EmailChannelDto } from '@/lib/dto';
import {
  CLINIC_B_ID,
  ensureClinic,
  ensureTestClinics,
} from '../support/clinics';
import { providerCalls, stubProviderFetch } from '../support/email-channel';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

type ChannelBody = { channel: EmailChannelDto | null };

const SENDER = 'Clínica X <contato@clinicax.com.br>';
const URL = '/api/settings/email-channel';

let seq = 0;
/** Clínica nova por teste: cada uma começa sem canal e sem trilha. */
const freshClinic = () => ensureClinic(`canal-cfg-${++seq}`);

const adminOf = (clinicId: string) =>
  cookieHeaderFor('company_admin', `admin@${clinicId}.test`, clinicId);

const route = () => import('@/app/api/settings/email-channel/route');

async function call<T>(
  method: 'GET' | 'PUT' | 'DELETE',
  headers: Record<string, string>,
  body?: unknown,
) {
  const handlers = await route();
  const response = await handlers[method](
    jsonRequest(URL, method, body, headers),
  );
  return { response, json: (await response.json()) as Envelope<T> };
}

const put = (headers: Record<string, string>, body: unknown) =>
  call<ChannelBody>('PUT', headers, body);
const get = (headers: Record<string, string>) =>
  call<ChannelBody>('GET', headers);

const services = async (clinicId: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  return getRepositories(clinicScope(clinicId));
};

/** Chave com que o próximo envio da clínica sai (`Bearer …`), ou `null` se não sai. */
async function keyOfNextSend(clinicId: string): Promise<string | null> {
  const fetchMock = stubProviderFetch(200);
  try {
    const { email } = await services(clinicId);
    if (!(await email.isEnabled())) return null;
    await email.send({ to: 'x@y.test', subject: 's', text: 't' });
    return providerCalls(fetchMock)[0]?.auth ?? null;
  } finally {
    vi.unstubAllGlobals();
  }
}

/**
 * C3 (#266): o Admin de Empresa salva, lê e remove o canal de e-mail da
 * clínica em `/api/settings/email-channel`. A chave é só de escrita.
 */
describe('Feature: /api/settings/email-channel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET sem canal devolve { channel: null }', async () => {
    const admin = adminOf(await freshClinic());

    const { response, json } = await get(admin);

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ channel: null });
  });

  it('salva o canal: 200 com provider, sender, secretLast4 e status nulo; GET devolve o mesmo formato', async () => {
    const admin = adminOf(await freshClinic());

    const saved = await put(admin, {
      provider: 'resend',
      sender: SENDER,
      apiKey: 're_chave_secreta_1234',
    });
    const read = await get(admin);

    const expected = {
      channel: {
        provider: 'resend',
        sender: SENDER,
        secretLast4: '1234',
        lastStatus: null,
        lastStatusAt: null,
        lastError: null,
      },
    };
    expect(saved.response.status).toBe(200);
    expect(saved.json.data).toEqual(expected);
    expect(read.response.status).toBe(200);
    expect(read.json.data).toEqual(expected);
  });

  it('salvar de novo com apiKey vazia muda o remetente e mantém a chave anterior', async () => {
    const clinicId = await freshClinic();
    const admin = adminOf(clinicId);
    await put(admin, {
      provider: 'resend',
      sender: SENDER,
      apiKey: 're_chave_antiga_AAAA',
    });

    const again = await put(admin, {
      provider: 'resend',
      sender: 'novo@clinicax.com.br',
      apiKey: '',
    });

    expect(again.response.status).toBe(200);
    expect(again.json.data.channel?.sender).toBe('novo@clinicax.com.br');
    expect(again.json.data.channel?.secretLast4).toBe('AAAA');
    expect(await keyOfNextSend(clinicId)).toBe('Bearer re_chave_antiga_AAAA');
  });

  it('salvar com apiKey preenchida substitui a chave e lastStatus volta a null', async () => {
    const clinicId = await freshClinic();
    const admin = adminOf(clinicId);
    await put(admin, {
      provider: 'resend',
      sender: SENDER,
      apiKey: 're_chave_antiga_AAAA',
    });
    // Canal já testado com sucesso antes da troca da chave.
    const { clinicChannels } = await services(clinicId);
    const current = await clinicChannels.find('email');
    if (!current) throw new Error('canal não gravado');
    await clinicChannels.save(
      current.recordTest({ ok: true }, new Date('2026-10-01T12:00:00Z')),
    );
    expect((await get(admin)).json.data.channel?.lastStatus).toBe('ok');

    const replaced = await put(admin, {
      provider: 'resend',
      sender: SENDER,
      apiKey: 're_chave_nova_BBBB',
    });

    expect(replaced.response.status).toBe(200);
    expect(replaced.json.data.channel).toMatchObject({
      secretLast4: 'BBBB',
      lastStatus: null,
      lastStatusAt: null,
      lastError: null,
    });
    expect(await keyOfNextSend(clinicId)).toBe('Bearer re_chave_nova_BBBB');
  });

  it.each([
    'contato',
    'Nome <sem-arroba>',
    'a@b',
    'Nome contato@clinicax.com.br',
  ])(
    'remetente inválido "%s": 400 com a mensagem do campo e nada gravado',
    async (sender) => {
      const admin = adminOf(await freshClinic());

      const { response, json } = await put(admin, {
        provider: 'resend',
        sender,
        apiKey: 're_chave_secreta_1234',
      });

      expect(response.status).toBe(400);
      expect(json.error).toMatch(/^Remetente inválido/);
      expect((await get(admin)).json.data).toEqual({ channel: null });
    },
  );

  it('remetente inválido num canal existente: 400 e o canal fica como estava', async () => {
    const admin = adminOf(await freshClinic());
    await put(admin, {
      provider: 'resend',
      sender: SENDER,
      apiKey: 're_chave_secreta_1234',
    });

    const { response } = await put(admin, {
      provider: 'resend',
      sender: 'invalido',
      apiKey: '',
    });

    expect(response.status).toBe(400);
    expect((await get(admin)).json.data.channel?.sender).toBe(SENDER);
  });

  it.each([
    ['vazia', ''],
    ['ausente', undefined],
  ])(
    'primeiro salvamento sem chave (%s): 400 "Chave de API obrigatória" e nada gravado',
    async (_label, apiKey) => {
      const admin = adminOf(await freshClinic());

      const { response, json } = await put(admin, {
        provider: 'resend',
        sender: SENDER,
        apiKey,
      });

      expect(response.status).toBe(400);
      expect(json.error).toBe('Chave de API obrigatória');
      expect((await get(admin)).json.data).toEqual({ channel: null });
    },
  );

  it('provider fora da lista: 400', async () => {
    const admin = adminOf(await freshClinic());

    const { response } = await put(admin, {
      provider: 'smtp',
      sender: SENDER,
      apiKey: 're_chave_secreta_1234',
    });

    expect(response.status).toBe(400);
  });

  it('remove o canal: 200 { removed: true }, a linha some e o próximo envio da clínica não sai', async () => {
    const clinicId = await freshClinic();
    const admin = adminOf(clinicId);
    await put(admin, {
      provider: 'resend',
      sender: SENDER,
      apiKey: 're_chave_secreta_1234',
    });
    expect(await keyOfNextSend(clinicId)).toBe('Bearer re_chave_secreta_1234');

    const { response, json } = await call<{ removed: boolean }>(
      'DELETE',
      admin,
    );

    expect(response.status).toBe(200);
    expect(json.data).toEqual({ removed: true });
    expect(
      await (await services(clinicId)).clinicChannels.find('email'),
    ).toBeNull();
    expect(await keyOfNextSend(clinicId)).toBeNull();
    // Idempotente: remover sem canal responde igual.
    const again = await call<{ removed: boolean }>('DELETE', admin);
    expect(again.response.status).toBe(200);
    expect(again.json.data).toEqual({ removed: true });
  });

  it('auditoria: 1º salvar = create, salvar de novo = update, remover = delete — clinic_channel com o id do canal', async () => {
    const clinicId = await freshClinic();
    const admin = adminOf(clinicId);
    await put(admin, {
      provider: 'resend',
      sender: SENDER,
      apiKey: 're_chave_secreta_1234',
    });
    const saved = await (await services(clinicId)).clinicChannels.find('email');
    const channelId = saved?.id;
    expect(channelId).toBeDefined();
    await put(admin, { provider: 'resend', sender: SENDER, apiKey: '' });
    await call('DELETE', admin);

    const events = await (await services(clinicId)).auditEvents.findAll({
      resourceType: 'clinic_channel',
    });

    expect(
      events
        .map((event) => ({
          action: event.action,
          resourceId: event.resourceId,
          clinicId: event.clinicId,
          actorRole: event.actorRole,
          detail: event.detail,
        }))
        .sort((a, b) => a.action.localeCompare(b.action)),
    ).toEqual(
      ['create', 'delete', 'update'].map((action) => ({
        action,
        resourceId: channelId,
        clinicId,
        actorRole: 'company_admin',
        detail: null,
      })),
    );
  });

  it('nunca expõe a chave: nem nas respostas, nem no log, nem na trilha', async () => {
    const clinicId = await freshClinic();
    const admin = adminOf(clinicId);
    const apiKey = 're_segredo_unico_9f8e7d6c';
    const logged: string[] = [];
    for (const level of ['info', 'warn', 'error', 'log', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }

    const bodies: string[] = [];
    bodies.push(
      JSON.stringify(
        (await put(admin, { provider: 'resend', sender: SENDER, apiKey })).json,
      ),
    );
    bodies.push(JSON.stringify((await get(admin)).json));
    stubProviderFetch(422);
    try {
      const test = await import('@/app/api/settings/email-channel/test/route');
      const tested = await test.POST(
        jsonRequest(`${URL}/test`, 'POST', undefined, admin),
      );
      bodies.push(JSON.stringify(await tested.json()));
    } finally {
      vi.unstubAllGlobals();
    }
    bodies.push(JSON.stringify((await call('DELETE', admin)).json));
    const trail = JSON.stringify(
      await (await services(clinicId)).auditEvents.findAll({
        resourceType: 'clinic_channel',
      }),
    );

    expect(bodies).toHaveLength(4);
    for (const body of bodies) {
      expect(body).not.toContain(apiKey);
    }
    expect(logged.join('\n')).not.toContain(apiKey);
    expect(trail).not.toContain(apiKey);
    expect(trail).toContain('test-failed');
  });

  it('outra clínica: o admin de B não vê nem apaga o canal de A', async () => {
    await ensureTestClinics();
    const clinicA = await freshClinic();
    await put(adminOf(clinicA), {
      provider: 'resend',
      sender: SENDER,
      apiKey: 're_chave_secreta_1234',
    });
    const adminB = adminOf(CLINIC_B_ID);

    const seenByB = await get(adminB);
    await call('DELETE', adminB);

    expect(seenByB.json.data).toEqual({ channel: null });
    expect((await get(adminOf(clinicA))).json.data.channel?.sender).toBe(
      SENDER,
    );
  });

  describe('403 para quem não é company_admin', () => {
    const roles: UserRole[] = [
      'atendente',
      'profissional',
      'patient',
      'partner',
      'super_admin',
    ];
    const calls = [
      ['GET', URL],
      ['PUT', URL],
      ['DELETE', URL],
      ['POST', `${URL}/test`],
    ] as const;

    it.each(
      roles.flatMap((role) =>
        calls.map(([method, url]) => [role, method, url]),
      ),
    )('%s em %s %s → 403', async (role, method, url) => {
      const clinicId = role === 'super_admin' ? null : await freshClinic();
      const headers = cookieHeaderFor(
        role as UserRole,
        `${role}@x.test`,
        clinicId,
      );
      const handlers: Record<string, (r: never) => Promise<Response>> =
        url === URL
          ? ((await route()) as never)
          : ((await import(
              '@/app/api/settings/email-channel/test/route'
            )) as never);
      const body =
        method === 'PUT'
          ? { provider: 'resend', sender: SENDER, apiKey: 're_chave_1234' }
          : undefined;

      const response = await handlers[method](
        jsonRequest(url, method, body, headers) as never,
      );

      expect(response.status).toBe(403);
    });
  });
});
