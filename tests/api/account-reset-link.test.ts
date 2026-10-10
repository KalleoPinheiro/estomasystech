import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
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
  delivered: boolean;
  inviteUrl: string | null;
}

const LINK = /^https:\/\/app\.vitta\.test\/definir-senha\?token=[\w-]+$/;

let seq = 0;
/** Chamador novo por teste: o limite de taxa é por conta de quem chama. */
const nextAdmin = () =>
  cookieHeaderFor('company_admin', `admin-reset-${++seq}@a.test`, CLINIC_A_ID);

const repositories = async (clinicId: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  return getRepositories(clinicScope(clinicId));
};

const seedAccount = async (
  clinicId: string,
  opts: { active?: boolean } = {},
) => {
  const account = UserAccount.create({
    email: `alvo-reset-${++seq}@${clinicId}.test`,
    passwordHash: 'scrypt$1$abc$def',
    role: 'atendente',
    clinicId,
    professionalId: null,
  });
  const stored = opts.active === false ? account.deactivate() : account;
  await (await repositories(clinicId)).userAccounts.save(stored);
  return stored;
};

const resetLink = async (id: string, headers: Record<string, string>) => {
  const route = await import('@/app/api/accounts/[id]/reset-link/route');
  const response = await route.POST(
    jsonRequest(`/api/accounts/${id}/reset-link`, 'POST', undefined, headers),
    { params: Promise.resolve({ id }) },
  );
  return { response, json: (await response.json()) as Envelope<LinkDto> };
};

const tokenOf = (url: string | null) =>
  new URL(url ?? 'https://x.test').searchParams.get('token') ?? '';

/**
 * C2 (#265): o Admin de Empresa gera o link de redefinição de uma conta da
 * clínica — o caminho de quem esqueceu a senha numa clínica sem canal.
 */
describe('Feature: POST /api/accounts/[id]/reset-link', () => {
  beforeAll(async () => {
    await ensureTestClinics();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('emite reset de 1 h, devolve o link sem canal e invalida o link anterior', async () => {
    const target = await seedAccount(CLINIC_A_ID);
    const admin = nextAdmin();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const before = Date.now();

    const first = await resetLink(target.id, admin);
    const second = await resetLink(target.id, admin);

    expect(second.response.status).toBe(200);
    expect(second.json.data.delivered).toBe(false);
    expect(second.json.data.inviteUrl).toMatch(LINK);
    const { hashAuthTokenSecret, RESET_TTL_MS } = await import(
      '@/domain/auth/auth-token'
    );
    const { authTokens } = await repositories(CLINIC_A_ID);
    // O primeiro link foi invalidado pela segunda emissão (#50).
    expect(
      await authTokens.claimBySecretHash(
        hashAuthTokenSecret(tokenOf(first.json.data.inviteUrl)),
      ),
    ).toBeNull();
    const hash = hashAuthTokenSecret(tokenOf(second.json.data.inviteUrl));
    expect(
      await authTokens.claimBySecretHash(hash, Date.now() + RESET_TTL_MS + 1),
    ).toBeNull();
    const token = await authTokens.claimBySecretHash(
      hash,
      before + RESET_TTL_MS - 60_000,
    );
    expect(token?.purpose).toBe('reset');
    expect(token?.accountId).toBe(target.id);
  });

  it('404 para conta de outra clínica e para id inexistente', async () => {
    const otherClinic = await seedAccount(CLINIC_B_ID);
    const admin = nextAdmin();

    const foreign = await resetLink(otherClinic.id, admin);
    const missing = await resetLink('nao-existe', admin);

    expect(foreign.response.status).toBe(404);
    expect(missing.response.status).toBe(404);
  });

  it('403 quando quem chama não é company_admin', async () => {
    const target = await seedAccount(CLINIC_A_ID);
    const atendente = cookieHeaderFor(
      'atendente',
      'atendente-reset@a.test',
      CLINIC_A_ID,
    );

    const { response } = await resetLink(target.id, atendente);

    expect(response.status).toBe(403);
  });

  it('409 com "Conta desativada" para alvo inativo', async () => {
    const target = await seedAccount(CLINIC_A_ID, { active: false });

    const { response, json } = await resetLink(target.id, nextAdmin());

    expect(response.status).toBe(409);
    expect(json.error).toBe('Conta desativada');
  });

  it('429 na 6ª chamada do mesmo chamador em 60 s', async () => {
    const target = await seedAccount(CLINIC_A_ID);
    const admin = nextAdmin();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await resetLink(target.id, admin)).response.status);
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('auditoria: grava detail reset-link na clínica e, em produção, nem link nem segredo na trilha ou no log', async () => {
    const target = await seedAccount(CLINIC_A_ID);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'b'.repeat(64));
    const logged: string[] = [];
    for (const level of ['info', 'warn', 'error', 'log'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }

    const { response, json } = await resetLink(target.id, nextAdmin());

    expect(response.status).toBe(200);
    const secret = tokenOf(json.data.inviteUrl);
    expect(secret).not.toBe('');
    const events = await (await repositories(CLINIC_A_ID)).auditEvents.findAll({
      resourceId: target.id,
    });
    expect(events).toEqual([
      expect.objectContaining({
        action: 'update',
        resourceType: 'account',
        resourceId: target.id,
        detail: 'reset-link',
        clinicId: CLINIC_A_ID,
      }),
    ]);
    const trail = JSON.stringify(events);
    expect(trail).not.toContain(secret);
    expect(trail).not.toContain('definir-senha');
    expect(logged.join('\n')).not.toContain(secret);
    expect(logged.join('\n')).not.toContain('definir-senha');
  });

  it('revoga sessões: definir a senha pelo link gerado incrementa session_version', async () => {
    const target = await seedAccount(CLINIC_A_ID);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { json } = await resetLink(target.id, nextAdmin());

    const setPassword = await import('@/app/api/auth/set-password/route');
    const response = await setPassword.POST(
      jsonRequest(
        '/api/auth/set-password',
        'POST',
        { token: tokenOf(json.data.inviteUrl), password: 'senha-nova-123' },
        { 'x-forwarded-for': '10.9.9.9' },
      ),
    );

    expect(response.status).toBe(200);
    const stored = await (
      await repositories(CLINIC_A_ID)
    ).userAccounts.findById(target.id);
    expect(stored?.sessionVersion).toBe(target.sessionVersion + 1);
  });
});
