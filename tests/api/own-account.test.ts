import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { totpCode, totpStep } from '@/domain/auth/totp';
import { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import { getRepositories } from '@/infrastructure/container';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const CURRENT = 'senha-atual-segura-1';
const NEXT = 'xk7#pq2vzm-nova';

let seq = 0;

/** Conta nova por teste: o limite de tentativas é por conta. */
const seed = async (role: UserRole = 'atendente') => {
  const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
  const account = UserAccount.create({
    email: `minha-conta-${++seq}@a.test`,
    passwordHash: await hashPassword(CURRENT),
    role,
    clinicId: CLINIC_A_ID,
  });
  await userAccounts.save(account);
  return account;
};

const asOwn = (account: UserAccount) =>
  cookieHeaderFor(account.role, account.email, CLINIC_A_ID);

const reload = async (id: string) => {
  const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
  const found = await userAccounts.findById(id);
  if (!found) throw new Error('conta sumiu');
  return found;
};

const cookieSession = (response: Response) =>
  verifySessionToken(
    process.env.AUTH_SECRET as string,
    response.headers
      .get('set-cookie')
      ?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1],
  );

const changePassword = async (
  headers: Record<string, string>,
  body: unknown,
) => {
  const route = await import('@/app/api/me/password/route');
  const response = await route.POST(
    jsonRequest('/api/me/password', 'POST', body, headers),
  );
  return { response, json: (await response.json()) as Envelope<unknown> };
};

const audit = async (id: string) => {
  const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
  return auditEvents.findAll({ resourceType: 'account', resourceId: id });
};

describe('Feature: Minha conta — troca da própria senha (#295)', () => {
  beforeAll(async () => {
    await ensureTestClinics();
  });

  it('senha atual certa troca a senha, sobe a session_version e renova só o cookie desta sessão', async () => {
    const account = await seed();

    const { response } = await changePassword(asOwn(account), {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });

    expect(response.status).toBe(200);
    const after = await reload(account.id);
    expect(await verifyPassword(NEXT, after.passwordHash)).toBe(true);
    expect(after.sessionVersion).toBe(account.sessionVersion + 1);
    // O cookie antigo (versão 0) deixa de valer; o novo carrega a versão atual.
    expect(cookieSession(response)?.sessionVersion).toBe(after.sessionVersion);
    expect((await audit(account.id)).map((e) => e.detail)).toEqual([
      'password-change',
    ]);
  });

  it('senha atual errada → 400, sem troca, sem sessão nova e sem auditoria', async () => {
    const account = await seed();

    const { response, json } = await changePassword(asOwn(account), {
      currentPassword: 'não-é-a-senha-atual',
      newPassword: NEXT,
    });

    expect(response.status).toBe(400);
    expect(json.error).toBe('Senha atual incorreta');
    const after = await reload(account.id);
    expect(after.passwordHash).toBe(account.passwordHash);
    expect(after.sessionVersion).toBe(account.sessionVersion);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await audit(account.id)).toEqual([]);
  });

  it.each([
    ['curta', 'xk7#pq2vz', 'A senha precisa ter ao menos 10 caracteres'],
    [
      'comum',
      'Senha12345',
      'Essa senha é muito comum e fácil de adivinhar. Escolha outra.',
    ],
    ['igual à atual', CURRENT, 'A nova senha precisa ser diferente da atual'],
  ])('nova senha %s → 400 e nada muda', async (_name, newPassword, message) => {
    const account = await seed();

    const { response, json } = await changePassword(asOwn(account), {
      currentPassword: CURRENT,
      newPassword,
    });

    expect(response.status).toBe(400);
    expect(json.error).toBe(message);
    expect((await reload(account.id)).passwordHash).toBe(account.passwordHash);
    expect(await audit(account.id)).toEqual([]);
  });

  it('corpo sem os dois campos ou com campo extra → 400', async () => {
    const account = await seed();

    const missing = await changePassword(asOwn(account), {
      currentPassword: CURRENT,
    });
    const extra = await changePassword(asOwn(account), {
      currentPassword: CURRENT,
      newPassword: NEXT,
      email: 'outro@a.test',
    });

    expect(missing.response.status).toBe(400);
    expect(extra.response.status).toBe(400);
  });

  it('falha de auditoria não troca a senha', async () => {
    const account = await seed();
    const { DrizzleAuditEventRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository'
    );
    const spy = vi
      .spyOn(DrizzleAuditEventRepository.prototype, 'save')
      .mockRejectedValue(new Error('auditoria indisponível'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { response } = await changePassword(asOwn(account), {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });
    spy.mockRestore();

    expect(response.status).toBe(500);
    expect((await reload(account.id)).passwordHash).toBe(account.passwordHash);
  });

  it('a 6ª tentativa da conta no minuto → 429', async () => {
    const account = await seed();
    const attempt = () =>
      changePassword(asOwn(account), {
        currentPassword: 'errada-de-novo',
        newPassword: NEXT,
      });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await attempt()).response.status);
    }

    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
  });

  it('paciente e modo sem sessão não usam Minha conta', async () => {
    const patient = await seed('patient');

    const asPatient = await changePassword(asOwn(patient), {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });
    const anonymous = await changePassword(
      { cookie: '' },
      { currentPassword: CURRENT, newPassword: NEXT },
    );

    expect(asPatient.response.status).toBe(403);
    expect(anonymous.response.status).toBe(401);
  });

  it('sessão de conta que não existe mais → 404', async () => {
    const ghost = cookieHeaderFor('atendente', 'fantasma@a.test', CLINIC_A_ID);

    const { response } = await changePassword(ghost, {
      currentPassword: CURRENT,
      newPassword: NEXT,
    });

    expect(response.status).toBe(404);
  });
});

const meGet = async (headers: Record<string, string>) => {
  const route = await import('@/app/api/me/route');
  const response = await route.GET(
    new NextRequest('http://localhost/api/me', { headers }),
  );
  return { response, json: (await response.json()) as Envelope<unknown> };
};

const enrollOwn = async (headers: Record<string, string>, body: unknown) => {
  const route = await import('@/app/api/me/mfa/enroll/route');
  const response = await route.POST(
    jsonRequest('/api/me/mfa/enroll', 'POST', body, headers),
  );
  return {
    response,
    json: (await response.json()) as Envelope<{
      secret: string;
      otpauthUri: string;
      pendingToken: string;
    }>,
  };
};

const confirmOwn = async (headers: Record<string, string>, body: unknown) => {
  const route = await import('@/app/api/me/mfa/confirm/route');
  return route.POST(jsonRequest('/api/me/mfa/confirm', 'POST', body, headers));
};

describe('Feature: Minha conta — segundo fator opcional (#295)', () => {
  it('GET /api/me mostra e-mail, papel e a situação do segundo fator', async () => {
    const account = await seed('profissional');

    const { json } = await meGet(asOwn(account));

    expect(json.data).toEqual({
      email: account.email,
      role: 'profissional',
      mfa: { policy: 'optional', enrolled: false },
    });
  });

  it('liga o 2º fator: senha atual → chave → código confirma, devolve os 10 códigos e renova a sessão', async () => {
    const account = await seed('atendente');
    const started = await enrollOwn(asOwn(account), {
      currentPassword: CURRENT,
    });
    expect(started.response.status).toBe(200);
    expect(started.json.data.otpauthUri).toContain('otpauth://totp/');
    // Nada gravado até confirmar o código.
    const { mfa } = await getRepositories(clinicScope(CLINIC_A_ID));
    expect(await mfa.findFactor(account.id)).toBeNull();

    const confirmed = await confirmOwn(asOwn(account), {
      pendingToken: started.json.data.pendingToken,
      code: totpCode(started.json.data.secret, totpStep(Date.now())),
    });
    const body = (await confirmed.json()) as Envelope<{
      recoveryCodes: string[];
    }>;

    expect(confirmed.status).toBe(200);
    expect(body.data.recoveryCodes).toHaveLength(10);
    expect(await mfa.findFactor(account.id)).not.toBeNull();
    const after = await reload(account.id);
    expect(after.sessionVersion).toBe(account.sessionVersion + 1);
    expect(cookieSession(confirmed)?.sessionVersion).toBe(after.sessionVersion);
    const me = await meGet(asOwn(account));
    expect(me.json.data).toMatchObject({ mfa: { enrolled: true } });
  });

  it('senha atual errada → 400 e nenhuma chave é emitida', async () => {
    const account = await seed('atendente');

    const { response, json } = await enrollOwn(asOwn(account), {
      currentPassword: 'não-é-a-senha-atual',
    });

    expect(response.status).toBe(400);
    expect(json.error).toBe('Senha atual incorreta');
  });

  it('segundo fator já ativo → 409', async () => {
    const account = await seed('profissional');
    const { mfa } = await getRepositories(clinicScope(CLINIC_A_ID));
    await mfa.completeEnrollment({
      accountId: account.id,
      secret: 'JBSWY3DPEHPK3PXP',
      step: 1,
      recoveryCodeHashes: ['h1'],
      expectedSessionVersion: account.sessionVersion,
      now: new Date(),
    });

    const { response, json } = await enrollOwn(asOwn(account), {
      currentPassword: CURRENT,
    });

    expect(response.status).toBe(409);
    expect(json.error).toBe('O segundo fator já está ativo');
  });

  it('código errado → 400 (nunca 401) e nada é gravado; cadastro de outra conta ou corpo ruim → 400', async () => {
    const account = await seed('atendente');
    const other = await seed('profissional');
    const started = await enrollOwn(asOwn(account), {
      currentPassword: CURRENT,
    });
    const { mfa } = await getRepositories(clinicScope(CLINIC_A_ID));
    const goodCode = totpCode(started.json.data.secret, totpStep(Date.now()));
    const wrongCode = goodCode === '000000' ? '111111' : '000000';

    const wrong = await confirmOwn(asOwn(account), {
      pendingToken: started.json.data.pendingToken,
      code: wrongCode,
    });
    const stolen = await confirmOwn(asOwn(other), {
      pendingToken: started.json.data.pendingToken,
      code: goodCode,
    });
    const malformed = await confirmOwn(asOwn(account), {
      pendingToken: started.json.data.pendingToken,
      code: 'abc',
    });
    const garbageToken = await confirmOwn(asOwn(account), {
      pendingToken: 'lixo',
      code: goodCode,
    });

    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as Envelope<null>).error).toBe(
      'Código inválido',
    );
    expect(stolen.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(garbageToken.status).toBe(400);
    expect(await mfa.findFactor(account.id)).toBeNull();
    expect(await mfa.findFactor(other.id)).toBeNull();
  });

  it('a 6ª confirmação da conta no minuto → 429', async () => {
    const account = await seed('atendente');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push(
        (
          await confirmOwn(asOwn(account), {
            pendingToken: 'lixo',
            code: '123456',
          })
        ).status,
      );
    }

    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
  });

  it('o mesmo token não cadastra duas vezes (a sessão já subiu de versão)', async () => {
    const account = await seed('atendente');
    const started = await enrollOwn(asOwn(account), {
      currentPassword: CURRENT,
    });
    const body = {
      pendingToken: started.json.data.pendingToken,
      code: totpCode(started.json.data.secret, totpStep(Date.now())),
    };

    const first = await confirmOwn(asOwn(account), body);
    const second = await confirmOwn(asOwn(account), body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
  });
});
