import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import { hashAuthTokenSecret, RESET_TTL_MS } from '@/domain/auth/auth-token';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';
import {
  DB_CONNECTION_FAILED_MESSAGE,
  DRY_RUN_MESSAGE,
  NO_SUPER_ADMIN_MESSAGE,
  ROLLED_BACK_MESSAGE,
  recoverSuperAdmin,
  runRecoverSuperAdminCli,
} from '@/infrastructure/persistence/drizzle/recover-super-admin';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import {
  hashPassword,
  UNSET_PASSWORD_HASH,
  verifyPassword,
} from '@/lib/auth/password';
import { createPgliteFromTemplate } from '../support/pglite-template';

const APP_URL = 'https://clinica.exemplo.com.br';
const OLD_EMAIL = 'dono@vitta.test';
const OLD_PASSWORD = 'senha-antiga-do-dono';
const SA_ID = 'sa-1';
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

let db: AppDb;

async function seed(options: { active?: boolean } = {}): Promise<void> {
  await db.insert(schema.userAccounts).values([
    {
      id: SA_ID,
      clinicId: null,
      email: OLD_EMAIL,
      passwordHash: await hashPassword(OLD_PASSWORD),
      role: 'super_admin',
      active: options.active ?? true,
      sessionVersion: 3,
      createdAt: new Date(NOW - 86_400_000),
    },
    {
      id: 'admin-clinica',
      clinicId: LEGACY_CLINIC_ID,
      email: 'admin@clinica.test',
      passwordHash: UNSET_PASSWORD_HASH,
      role: 'company_admin',
      active: true,
      sessionVersion: 0,
      createdAt: new Date(NOW - 86_400_000),
    },
  ]);
  await db.insert(schema.userMfa).values({
    accountId: SA_ID,
    totpSecret: 'segredo-cifrado',
    enrolledAt: new Date(NOW - 3_600_000),
    lastUsedStep: 100,
  });
  await db.insert(schema.mfaRecoveryCodes).values(
    Array.from({ length: 10 }, (_, index) => ({
      id: `rc-${index}`,
      accountId: SA_ID,
      codeHash: `scrypt$hash-${index}`,
      usedAt: index === 0 ? new Date(NOW - 60_000) : null,
      createdAt: new Date(NOW - 3_600_000),
    })),
  );
  await db.insert(schema.authTokens).values([
    {
      id: 'tok-invite',
      accountId: SA_ID,
      purpose: 'invite',
      secretHash: 'h-invite',
      expiresAt: new Date(NOW + 3_600_000),
      usedAt: null,
      createdAt: new Date(NOW - 60_000),
    },
    {
      id: 'tok-reset',
      accountId: SA_ID,
      purpose: 'reset',
      secretHash: 'h-reset',
      expiresAt: new Date(NOW + 3_600_000),
      usedAt: null,
      createdAt: new Date(NOW - 60_000),
    },
  ]);
}

const superAdmin = async () => {
  const [row] = await db
    .select()
    .from(schema.userAccounts)
    .where(eq(schema.userAccounts.id, SA_ID));
  return row;
};
const factorRows = () =>
  db.select().from(schema.userMfa).where(eq(schema.userMfa.accountId, SA_ID));
const codeRows = () =>
  db
    .select()
    .from(schema.mfaRecoveryCodes)
    .where(eq(schema.mfaRecoveryCodes.accountId, SA_ID));
const tokenRows = () =>
  db
    .select()
    .from(schema.authTokens)
    .where(eq(schema.authTokens.accountId, SA_ID));
const auditRows = () =>
  db
    .select()
    .from(schema.auditEvents)
    .where(eq(schema.auditEvents.resourceType, 'account-recovery'));

const recover = (options: { newEmail?: string; confirm?: boolean } = {}) =>
  recoverSuperAdmin(db, {
    appUrl: APP_URL,
    confirm: options.confirm ?? true,
    newEmail: options.newEmail,
    nowMs: NOW,
  });

/** Estado que uma recuperação recusada ou desfeita não pode tocar. */
async function snapshot() {
  const account = await superAdmin();
  return {
    email: account.email,
    passwordHash: account.passwordHash,
    sessionVersion: account.sessionVersion,
    active: account.active,
    factors: (await factorRows()).length,
    codes: (await codeRows()).length,
    unusedTokens: (await tokenRows()).filter((t) => t.usedAt === null).length,
    audit: (await auditRows()).length,
  };
}

const failingAudit: AuditEventRepository = {
  save: () => Promise.reject(new Error('auditoria fora do ar')),
  findAll: () => Promise.resolve([]),
  findPlatformTrail: () => Promise.resolve([]),
};

beforeEach(async () => {
  db = drizzle(await createPgliteFromTemplate(), {
    schema,
  }) as unknown as AppDb;
});

describe('Feature: recuperação de emergência do super_admin (B3)', () => {
  describe('recoverSuperAdmin', () => {
    it('Dado um super_admin com fator, Quando recuperar, Então remove o segundo fator e os códigos', async () => {
      await seed();
      await recover();
      expect(await factorRows()).toHaveLength(0);
      expect(await codeRows()).toHaveLength(0);
    });

    it('Dado session_version 3, Quando recuperar, Então derruba as sessões (vira 4)', async () => {
      await seed();
      await recover();
      expect((await superAdmin()).sessionVersion).toBe(4);
    });

    it('Dado a senha antiga, Quando recuperar, Então invalida a senha antiga', async () => {
      await seed();
      await recover();
      const account = await superAdmin();
      expect(account.passwordHash).toBe(UNSET_PASSWORD_HASH);
      expect(await verifyPassword(OLD_PASSWORD, account.passwordHash)).toBe(
        false,
      );
    });

    it('Dado --novo-email, Quando recuperar, Então troca o e-mail (normalizado); sem ele, mantém', async () => {
      await seed();
      const result = await recover({ newEmail: '  Novo.Dono@Vitta.TEST ' });
      expect((await superAdmin()).email).toBe('novo.dono@vitta.test');
      expect(result.plan.newEmail).toBe('novo.dono@vitta.test');

      await recover();
      expect((await superAdmin()).email).toBe('novo.dono@vitta.test');

      // Igual ao atual: não é troca.
      const same = await recover({ newEmail: 'NOVO.dono@vitta.test' });
      expect(same.plan.newEmail).toBeNull();
    });

    it('Dado tokens vivos, Quando recuperar, Então emite o link de 1 hora e invalida os anteriores', async () => {
      await seed();
      const result = await recover();
      if (!result.applied) throw new Error('esperava aplicado');

      const prefix = `${APP_URL}/definir-senha?token=`;
      expect(result.link.startsWith(prefix)).toBe(true);
      const secret = result.link.slice(prefix.length);
      expect(result.expiresAt.getTime()).toBe(NOW + RESET_TTL_MS);
      expect(RESET_TTL_MS).toBe(60 * 60 * 1000);

      const tokens = await tokenRows();
      const alive = tokens.filter((t) => t.usedAt === null);
      expect(alive).toHaveLength(1);
      expect(alive[0]).toMatchObject({
        purpose: 'reset',
        secretHash: hashAuthTokenSecret(secret),
        expiresAt: new Date(NOW + RESET_TTL_MS),
      });
      expect(tokens.find((t) => t.id === 'tok-invite')?.usedAt).not.toBeNull();
      expect(tokens.find((t) => t.id === 'tok-reset')?.usedAt).not.toBeNull();

      // Rodar de novo (fator já ausente) não é erro e troca o link.
      const again = await recover();
      if (!again.applied) throw new Error('esperava aplicado');
      expect(again.link).not.toBe(result.link);
      expect((await tokenRows()).filter((t) => t.usedAt === null)).toHaveLength(
        1,
      );
    });

    it('Dado a recuperação, Quando auditar, Então audita pelo caminho do login como evento de plataforma (clinic_id nulo, B6), sem o e-mail', async () => {
      await seed();
      await recover();
      await recover({ newEmail: 'novo@vitta.test' });
      const events = await auditRows();
      expect(events).toHaveLength(2);
      for (const event of events) {
        expect(event).toMatchObject({
          clinicId: null,
          actorRole: 'super_admin',
          actorId: 'script:recover-super-admin',
          action: 'update',
          resourceId: SA_ID,
          patientId: null,
        });
        expect(JSON.stringify(event)).not.toContain('vitta.test');
      }
      expect(events.map((e) => e.detail).sort()).toEqual([
        'super_admin_recovered',
        'super_admin_recovered;email_changed',
      ]);
    });

    it('Dado nenhum super_admin, Quando recuperar, Então recusa sem super_admin e nada é gravado', async () => {
      await expect(recover()).rejects.toThrow(NO_SUPER_ADMIN_MESSAGE);
      expect(await auditRows()).toHaveLength(0);
    });

    it('Dado um e-mail em uso por conta de clínica, Quando recuperar, Então recusa (e-mail em uso) e nada muda', async () => {
      await seed();
      const before = await snapshot();
      await expect(recover({ newEmail: 'ADMIN@clinica.test' })).rejects.toThrow(
        'O e-mail admin@clinica.test já é usado por outra conta. Nada foi alterado.',
      );
      expect(await snapshot()).toEqual(before);
    });

    it('Dado um e-mail inválido, Quando recuperar, Então recusa (e-mail inválido) e nada muda', async () => {
      await seed();
      const before = await snapshot();
      await expect(recover({ newEmail: 'sem-arroba' })).rejects.toThrow(
        'Email inválido',
      );
      expect(await snapshot()).toEqual(before);
    });

    it('Dado a auditoria falhando, Quando recuperar, Então a falha no meio desfaz tudo', async () => {
      await seed();
      const before = await snapshot();
      await expect(
        recoverSuperAdmin(db, {
          appUrl: APP_URL,
          confirm: true,
          newEmail: 'outro@vitta.test',
          nowMs: NOW,
          auditEventsFor: () => failingAudit,
        }),
      ).rejects.toThrow('auditoria fora do ar');
      expect(await snapshot()).toEqual(before);
    });

    it('Dado a conta desativada, Quando recuperar, Então reativa a conta', async () => {
      await seed({ active: false });
      const result = await recover();
      expect(result.plan.wasInactive).toBe(true);
      expect((await superAdmin()).active).toBe(true);
    });

    it('Dado confirm=false, Quando recuperar, Então a simulação não altera nada e devolve o plano', async () => {
      await seed();
      const before = await snapshot();
      const result = await recover({
        confirm: false,
        newEmail: 'n@vitta.test',
      });
      expect(result).toEqual({
        applied: false,
        plan: {
          accountId: SA_ID,
          currentEmail: OLD_EMAIL,
          newEmail: 'n@vitta.test',
          hadFactor: true,
          wasInactive: false,
        },
      });
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('runRecoverSuperAdminCli', () => {
    const run = async (
      argv: string[],
      overrides: {
        env?: Readonly<Record<string, string | undefined>>;
        openDb?: () => Promise<AppDb>;
        auditEventsFor?: () => AuditEventRepository;
      } = {},
    ) => {
      const out: string[] = [];
      const err: string[] = [];
      let opened = false;
      const code = await runRecoverSuperAdminCli(argv, {
        env: overrides.env ?? { APP_URL },
        openDb:
          overrides.openDb ??
          (() => {
            opened = true;
            return Promise.resolve(db);
          }),
        out: (line) => out.push(line),
        err: (line) => err.push(line),
        auditEventsFor: overrides.auditEventsFor,
      });
      return { code, out: out.join('\n'), err: err.join('\n'), opened };
    };

    it('Dado --confirmar, Quando rodar, Então a cli aplica com --confirmar: imprime o link de 1 hora e sai 0', async () => {
      await seed();
      const result = await run(['--confirmar', '--novo-email=novo@vitta.test']);
      expect(result.code).toBe(0);
      expect(result.out).toContain('vale 1 hora');
      expect(result.out).toMatch(
        /https:\/\/clinica\.exemplo\.com\.br\/definir-senha\?token=[\w-]{20,}/,
      );
      expect(result.out).toContain('E-mail passa a ser: novo@vitta.test');
      expect(result.err).toBe('');
      expect((await superAdmin()).email).toBe('novo@vitta.test');
    });

    it('Dado sem --confirmar, Quando rodar, Então a cli simula sem --confirmar e sai 0', async () => {
      await seed();
      const before = await snapshot();
      const result = await run([]);
      expect(result.code).toBe(0);
      expect(result.out).toContain(DRY_RUN_MESSAGE);
      expect(result.out).not.toContain('definir-senha');
      expect(await snapshot()).toEqual(before);
    });

    it('Dado uma flag desconhecida, Quando rodar, Então a cli recusa flag desconhecida com uso e sai 2', async () => {
      await seed();
      const before = await snapshot();
      for (const argv of [['--sim'], ['posicional'], ['--novo-email']]) {
        const result = await run(argv);
        expect(result.code, argv.join(' ')).toBe(2);
        expect(result.err).toContain('Uso: npm run admin:recover');
        expect(result.opened).toBe(false);
      }
      expect(await snapshot()).toEqual(before);
    });

    it('Dado APP_URL ausente ou http externo, Quando rodar, Então a cli exige APP_URL segura e sai 2 sem abrir o banco', async () => {
      for (const env of [
        {},
        { APP_URL: 'http://clinica.exemplo.com.br' },
        { APP_URL: 'não é url' },
      ]) {
        const result = await run(['--confirmar'], { env });
        expect(result.code, JSON.stringify(env)).toBe(2);
        expect(result.err).toContain('APP_URL');
        expect(result.opened).toBe(false);
      }
      await seed();
      const local = await run(['--confirmar'], {
        env: { APP_URL: 'http://localhost:3000' },
      });
      expect(local.code).toBe(0);
    });

    it('Dado pré-condição não atendida, Quando rodar, Então a cli pré-condição sai 2 com a mensagem', async () => {
      const empty = await run(['--confirmar']);
      expect(empty).toMatchObject({ code: 2, err: NO_SUPER_ADMIN_MESSAGE });

      await seed();
      const taken = await run([
        '--confirmar',
        '--novo-email=admin@clinica.test',
      ]);
      expect(taken.code).toBe(2);
      expect(taken.err).toContain('já é usado por outra conta');

      const invalid = await run(['--confirmar', '--novo-email=x']);
      expect(invalid).toMatchObject({ code: 2, err: 'Email inválido' });
    });

    it('Dado uma falha inesperada, Quando rodar, Então a cli falha inesperada sai 1 dizendo que nada foi alterado', async () => {
      await seed();
      const before = await snapshot();
      const broken = await run(['--confirmar'], {
        auditEventsFor: () => failingAudit,
      });
      expect(broken.code).toBe(1);
      expect(broken.err).toContain(ROLLED_BACK_MESSAGE);
      expect(await snapshot()).toEqual(before);

      const offline = await run(['--confirmar'], {
        openDb: () => Promise.reject(new Error('conexão recusada')),
      });
      expect(offline.code).toBe(1);
      expect(offline.err).toContain(DB_CONNECTION_FAILED_MESSAGE);
      expect(offline.err).not.toContain('transação desfeita');
    });
  });
});
