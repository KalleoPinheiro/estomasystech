import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ClinicChannel } from '@/domain/clinic/clinic-channel';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';

process.env.VITTA_DB_DRIVER = 'pglite';

const message = { to: 'paciente@x.test', subject: 'Assunto', text: 'Corpo' };

const saveEmailChannel = async (clinicId: string, apiKey: string) => {
  const { clinicChannels } = await getRepositories(clinicScope(clinicId));
  await clinicChannels.save(
    ClinicChannel.configure({
      clinicId,
      channel: 'email',
      provider: 'resend',
      sender: `Clínica <contato@${clinicId}.test>`,
      apiKey,
      by: 'admin@clinica.test',
    }),
  );
};

/** Credencial e remetente de cada chamada ao Resend, na ordem. */
const sentWith = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([, options]) => {
    const init = options as RequestInit;
    return {
      auth: (init.headers as Record<string, string>).Authorization,
      from: JSON.parse(init.body as string).from as string,
    };
  });

/**
 * C1 (#264, ADR-011): o `EmailGateway` dos serviços sai pelo canal da clínica
 * do escopo; sem canal, não sai — nunca pela conta da plataforma.
 */
describe('Feature: Gateway de e-mail resolvido pelo escopo', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    await ensureTestClinics();
  });

  beforeEach(async () => {
    await (await getDb()).delete(schema.clinicChannels);
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('canal da clínica: envia pelo Resend com a chave e o remetente da clínica', async () => {
    await saveEmailChannel(CLINIC_A_ID, 're_chave_da_A');
    const { email } = await getRepositories(clinicScope(CLINIC_A_ID));

    await email.send(message);

    expect(await email.isEnabled()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
    expect(sentWith(fetchMock)).toEqual([
      {
        auth: 'Bearer re_chave_da_A',
        from: `Clínica <contato@${CLINIC_A_ID}.test>`,
      },
    ]);
  });

  it('sem canal: clínica sem canal não envia, mesmo com a chave da plataforma definida', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_da_plataforma');
    vi.stubEnv('EMAIL_FROM', 'VittaFlow <no-reply@vitta.test>');
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { email } = await getRepositories(clinicScope(CLINIC_B_ID));

    await email.send(message);

    expect(await email.isEnabled()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('plataforma: o escopo de sistema envia pela chave da plataforma', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_da_plataforma');
    vi.stubEnv('EMAIL_FROM', 'VittaFlow <no-reply@vitta.test>');
    const { email } = await getRepositories(systemScope());

    await email.send(message);

    expect(await email.isEnabled()).toBe(true);
    expect(sentWith(fetchMock)).toEqual([
      {
        auth: 'Bearer re_da_plataforma',
        from: 'VittaFlow <no-reply@vitta.test>',
      },
    ]);
  });

  it('plataforma: sem as variáveis, o escopo de sistema fica desativado', async () => {
    const { email } = await getRepositories(systemScope());

    expect(await email.isEnabled()).toBe(false);
  });

  it('intercaladas: duas clínicas enviam cada uma com a própria chave no mesmo processo', async () => {
    await saveEmailChannel(CLINIC_A_ID, 're_chave_da_A');
    await saveEmailChannel(CLINIC_B_ID, 're_chave_da_B');
    const a1 = (await getRepositories(clinicScope(CLINIC_A_ID))).email;
    const b1 = (await getRepositories(clinicScope(CLINIC_B_ID))).email;
    const a2 = (await getRepositories(clinicScope(CLINIC_A_ID))).email;

    await Promise.all([a1.send(message), b1.send(message)]);
    const concurrent = sentWith(fetchMock).map((call) => call.auth);
    await b1.send(message);
    await a2.send(message);

    // O par concorrente chega em qualquer ordem; cada um com a própria chave.
    expect([...concurrent].sort()).toEqual([
      'Bearer re_chave_da_A',
      'Bearer re_chave_da_B',
    ]);
    expect(
      sentWith(fetchMock)
        .slice(2)
        .map((call) => call.auth),
    ).toEqual(['Bearer re_chave_da_B', 'Bearer re_chave_da_A']);
  });

  it('não decifra: canal ilegível desativa o e-mail da clínica e loga só o id', async () => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64));
    await saveEmailChannel(CLINIC_A_ID, 're_chave_secreta_A');
    const [row] = await (await getDb()).select().from(schema.clinicChannels);
    // Troca da chave de dados sem DATA_ENCRYPTION_KEY_PREVIOUS.
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'b'.repeat(64));
    const errorLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { email } = await getRepositories(clinicScope(CLINIC_A_ID));

    expect(await email.isEnabled()).toBe(false);
    await email.send(message);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain(CLINIC_A_ID);
    expect(logged).not.toContain('re_chave_secreta_A');
    expect(logged).not.toContain(row.encryptedSecret);
  });
});
