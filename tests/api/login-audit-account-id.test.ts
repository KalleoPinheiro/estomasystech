import { beforeAll, describe, expect, it } from 'vitest';
import type { AuditEvent } from '@/domain/audit/audit-event';
import { UserAccount } from '@/domain/auth/user-account';
import { getRepositories } from '@/infrastructure/container';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { systemScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const PASSWORD = 'senha-audit-887';

let seq = 0;
let ip = 0;
let passwordHash = '';

async function login(email: string, password = PASSWORD) {
  ip += 1;
  const route = await import('@/app/api/auth/login/route');
  const response = await route.POST(
    jsonRequest(
      '/api/auth/login',
      'POST',
      { email, password },
      { 'x-forwarded-for': `10.88.7.${ip}` },
    ),
  );
  const body = (await response.json()) as { error: string | null };
  return {
    status: response.status,
    error: body.error,
    cookie: response.cookies.get(SESSION_COOKIE)?.value ?? null,
  };
}

async function seed(email: string, clinicId: string): Promise<UserAccount> {
  const account = UserAccount.create({
    email,
    passwordHash,
    role: 'atendente',
    clinicId,
  });
  await (await getRepositories(systemScope())).userAccounts.save(account);
  return account;
}

/** Eventos `session` gravados depois deste instante, neste arquivo. */
async function sessionEventsAfter(mark: Set<string>): Promise<AuditEvent[]> {
  const { auditEvents } = await getRepositories(systemScope());
  return (await auditEvents.findAll()).filter(
    (event) => !mark.has(event.id) && event.resourceType === 'session',
  );
}

async function markEvents(): Promise<Set<string>> {
  const { auditEvents } = await getRepositories(systemScope());
  return new Set((await auditEvents.findAll()).map((event) => event.id));
}

describe('Feature: Trilha do login identifica a conta pelo id (#887)', () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
    await ensureTestClinics();
  });

  it('Dada a senha certa, Quando entrar, Então resource_id e actor_id são o id da conta e o cookie segue com o e-mail', async () => {
    const email = `entra-${++seq}@login-audit.test`;
    const account = await seed(email, CLINIC_A_ID);
    const before = await markEvents();

    const result = await login(email);

    expect(result.status).toBe(200);
    const session = verifySessionToken(
      process.env.AUTH_SECRET as string,
      result.cookie as string,
    );
    expect(session?.subject).toBe(email);
    const events = await sessionEventsAfter(before);
    expect(events).toEqual([
      expect.objectContaining({
        action: 'read',
        resourceId: account.id,
        actorId: account.id,
        actorRole: 'atendente',
        clinicId: CLINIC_A_ID,
        detail: null,
      }),
    ]);
    expect(events[0]?.resourceId).not.toContain('@');
    expect(events[0]?.actorId).not.toContain('@');
  });

  it('Dada senha errada, Quando entrar, Então os dois ids ficam vazios e o e-mail não vai para a trilha', async () => {
    const email = `errada-${++seq}@login-audit.test`;
    await seed(email, CLINIC_A_ID);
    const before = await markEvents();

    const result = await login(email, 'senha-errada');

    expect(result.status).toBe(401);
    expect(await sessionEventsAfter(before)).toEqual([
      expect.objectContaining({
        resourceId: '',
        actorId: '',
        actorRole: 'anonymous',
        detail: 'invalid_credentials',
        clinicId: null,
      }),
    ]);
  });

  it('Dado e-mail sem conta, Quando entrar, Então os dois ids ficam vazios', async () => {
    const before = await markEvents();

    const result = await login(`ninguem-${++seq}@login-audit.test`, 'qualquer');

    expect(result.status).toBe(401);
    expect(await sessionEventsAfter(before)).toEqual([
      expect.objectContaining({
        resourceId: '',
        actorId: '',
        actorRole: 'anonymous',
        detail: 'invalid_credentials',
        clinicId: null,
      }),
    ]);
  });

  it('Dada a mesma senha em duas empresas, Quando entrar, Então os ids ficam vazios e o detalhe é ambiguous_credentials', async () => {
    const email = `ambiguo-${++seq}@login-audit.test`;
    await seed(email, CLINIC_A_ID);
    await seed(email, CLINIC_B_ID);
    const before = await markEvents();

    const result = await login(email);

    expect(result.status).toBe(401);
    expect(result.error).toContain('Email ou senha incorretos');
    expect(await sessionEventsAfter(before)).toEqual([
      expect.objectContaining({
        resourceId: '',
        actorId: '',
        actorRole: 'anonymous',
        detail: 'ambiguous_credentials',
        clinicId: null,
      }),
    ]);
  });
});
