import { drizzle } from 'drizzle-orm/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  recoverSuperAdmin,
  runRecoverSuperAdminCli,
} from '@/infrastructure/persistence/drizzle/recover-super-admin';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { createPgliteFromTemplate } from '../support/pglite-template';

const APP_URL = 'https://clinica.exemplo.com.br';
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

let db: AppDb;

const seedSuperAdmin = (active: boolean) =>
  db.insert(schema.userAccounts).values({
    id: 'sa-1',
    clinicId: null,
    email: 'dono@estomasystech.test',
    passwordHash: UNSET_PASSWORD_HASH,
    role: 'super_admin',
    active,
    sessionVersion: 0,
    createdAt: new Date(NOW - 86_400_000),
  });

const runCli = async (
  overrides: {
    openDb?: () => Promise<AppDb>;
    auditEventsFor?: () => never;
  } = {},
) => {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runRecoverSuperAdminCli(['--confirmar'], {
    env: { APP_URL },
    openDb: overrides.openDb ?? (() => Promise.resolve(db)),
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    auditEventsFor: overrides.auditEventsFor,
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
};

beforeEach(async () => {
  db = drizzle(await createPgliteFromTemplate(), {
    schema,
  }) as unknown as AppDb;
});

describe('Feature: Relato da recuperação do super_admin descreve o que de fato mudou (B3)', () => {
  it('Dado conta ativa e sem segundo fator, Quando simular, Então o plano diz que não havia fator e não menciona reativação', async () => {
    await seedSuperAdmin(true);

    const { plan } = await recoverSuperAdmin(db, {
      appUrl: APP_URL,
      confirm: false,
      nowMs: NOW,
    });

    expect(plan.hadFactor).toBe(false);
    expect(plan.wasInactive).toBe(false);
  });

  it('Dado conta desativada e sem segundo fator, Quando aplicar pela linha de comando, Então o relato diz que não havia fator e que a conta foi reativada', async () => {
    await seedSuperAdmin(false);

    const result = await runCli();

    expect(result.code).toBe(0);
    expect(result.out).toContain('Segundo fator: não havia');
    expect(result.out).toContain('Conta estava desativada: reativada');
  });

  it('Dado falha que não é um Error, Quando abrir o banco ou aplicar, Então o relato mostra o valor como texto e sai 1', async () => {
    const offline = await runCli({
      openDb: () => Promise.reject('rede indisponível'),
    });
    expect(offline.code).toBe(1);
    expect(offline.err).toContain('rede indisponível');

    await seedSuperAdmin(true);
    const broken = await runCli({
      auditEventsFor: () => {
        throw 'auditoria fora do ar';
      },
    });
    expect(broken.code).toBe(1);
    expect(broken.err).toContain('auditoria fora do ar');
  });
});
