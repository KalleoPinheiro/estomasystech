import { parseArgs } from 'node:util';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { isSafeOrigin } from '@/application/auth/send-invite';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import { AuthToken, RESET_TTL_MS } from '@/domain/auth/auth-token';
import { normalizeAccountEmail } from '@/domain/auth/user-account';
import { ValidationError } from '@/domain/shared/errors';
import { recordAuditNow } from '@/lib/audit';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import type { AppDb } from './db';
import { DrizzleAuditEventRepository } from './drizzle-audit-event-repository';
import { DrizzleAuthTokenRepository } from './drizzle-auth-token-repository';
import { authTokens, mfaRecoveryCodes, userAccounts, userMfa } from './schema';

/**
 * Recuperação de emergência do super_admin (bloco B3, ADR-009): quem perdeu
 * senha, e-mail ou autenticador e códigos volta a entrar por um script rodado
 * com `DATABASE_URL`, sem nenhuma rota pública nova. Uso e roteiro:
 * docs/engineering/producao.md § 10.
 */

export const NO_SUPER_ADMIN_MESSAGE =
  'Nenhum super_admin nesta instalação. Use o bootstrap (docs/engineering/producao.md § 8).';
export const ROLLED_BACK_MESSAGE =
  'Falha: nada foi alterado (transação desfeita).';
/**
 * hazard: `openDb()` roda antes de qualquer transação existir — se a conexão
 * falhar (DATABASE_URL errada, banco fora do ar), o operador não pode ler
 * ROLLED_BACK_MESSAGE, ou conclui erroneamente que o banco abriu e uma
 * transação chegou a rodar.
 */
export const DB_CONNECTION_FAILED_MESSAGE =
  'Falha ao conectar ao banco (confira DATABASE_URL): nada foi alterado.';
export const DRY_RUN_MESSAGE =
  'Simulação: nada foi alterado. Rode de novo com --confirmar para aplicar.';
export const AUDIT_ACTOR_ID = 'script:recover-super-admin';

export const emailInUseMessage = (email: string): string =>
  `O e-mail ${email} já é usado por outra conta. Nada foi alterado.`;

/** Erro que o operador corrige no comando ou no banco — saída 2, nada gravado. */
export class RecoveryPreconditionError extends Error {}

export interface RecoverSuperAdminOptions {
  /** Base pública (`APP_URL`), já validada — compõe o link de definir senha. */
  appUrl: string;
  newEmail?: string;
  /** `false` = simulação: valida e devolve o plano sem escrever. */
  confirm: boolean;
  nowMs?: number;
  /** Ponto de injeção para testes; o padrão grava em `audit_events`. */
  auditEventsFor?: (db: AppDb) => AuditEventRepository;
}

export interface RecoveryPlan {
  accountId: string;
  currentEmail: string;
  /** `null` quando não há troca (sem flag ou igual ao atual). */
  newEmail: string | null;
  hadFactor: boolean;
  wasInactive: boolean;
}

export type RecoverSuperAdminResult =
  | { applied: false; plan: RecoveryPlan }
  | { applied: true; plan: RecoveryPlan; link: string; expiresAt: Date };

type SuperAdminRow = typeof userAccounts.$inferSelect;

async function lockSuperAdmin(db: AppDb): Promise<SuperAdminRow> {
  const [row] = await db
    .select()
    .from(userAccounts)
    .where(
      and(eq(userAccounts.role, 'super_admin'), isNull(userAccounts.clinicId)),
    )
    .limit(1)
    .for('update');
  if (!row) throw new RecoveryPreconditionError(NO_SUPER_ADMIN_MESSAGE);
  return row;
}

/** E-mail novo normalizado, `null` sem troca; recusa o que outra conta usa. */
async function resolveNewEmail(
  db: AppDb,
  account: SuperAdminRow,
  raw: string | undefined,
): Promise<string | null> {
  if (raw === undefined) return null;
  let email: string;
  try {
    email = normalizeAccountEmail(raw);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new RecoveryPreconditionError(error.message);
    }
    throw error;
  }
  if (email === account.email) return null;
  const [taken] = await db
    .select({ id: userAccounts.id })
    .from(userAccounts)
    .where(and(eq(userAccounts.email, email), ne(userAccounts.id, account.id)))
    .limit(1);
  if (taken) throw new RecoveryPreconditionError(emailInUseMessage(email));
  return email;
}

async function buildPlan(
  db: AppDb,
  account: SuperAdminRow,
  rawEmail: string | undefined,
): Promise<RecoveryPlan> {
  const [factor] = await db
    .select({ accountId: userMfa.accountId })
    .from(userMfa)
    .where(eq(userMfa.accountId, account.id))
    .limit(1);
  return {
    accountId: account.id,
    currentEmail: account.email,
    newEmail: await resolveNewEmail(db, account, rawEmail),
    hadFactor: Boolean(factor),
    wasInactive: !account.active,
  };
}

async function applyRecovery(
  tx: AppDb,
  account: SuperAdminRow,
  plan: RecoveryPlan,
  options: RecoverSuperAdminOptions,
): Promise<{ link: string; expiresAt: Date }> {
  const nowMs = options.nowMs ?? Date.now();
  const now = new Date(nowMs);
  await tx
    .delete(mfaRecoveryCodes)
    .where(eq(mfaRecoveryCodes.accountId, account.id));
  await tx.delete(userMfa).where(eq(userMfa.accountId, account.id));
  // Senha antiga inválida: quem a tem não encontra a conta sem fator e
  // cadastra o próprio autenticador antes do dono (janela do ADR-008).
  await tx
    .update(userAccounts)
    .set({
      email: plan.newEmail ?? account.email,
      passwordHash: UNSET_PASSWORD_HASH,
      active: true,
      sessionVersion: sql`${userAccounts.sessionVersion} + 1`,
    })
    .where(eq(userAccounts.id, account.id));
  await tx
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.accountId, account.id),
        inArray(authTokens.purpose, ['invite', 'reset']),
        isNull(authTokens.usedAt),
      ),
    );
  const { token, secret } = AuthToken.issue({
    accountId: account.id,
    purpose: 'reset',
    nowMs,
  });
  await new DrizzleAuthTokenRepository(tx).save(token);
  const auditEventsFor =
    options.auditEventsFor ??
    ((db) => new DrizzleAuditEventRepository(db, null));
  // Caminho do login (decisão do dono, 2026-09-27): sem empresa, é evento de
  // plataforma (`clinic_id` nulo, B6) — repositório de escopo de sistema.
  await recordAuditNow(auditEventsFor(tx), null, {
    action: 'update',
    resourceType: 'account-recovery',
    resourceId: account.id,
    detail: plan.newEmail
      ? 'super_admin_recovered;email_changed'
      : 'super_admin_recovered',
    actorOverride: { role: 'super_admin', id: AUDIT_ACTOR_ID, clinicId: null },
  });
  const base = options.appUrl.replace(/\/$/, '');
  return {
    link: `${base}/definir-senha?token=${secret}`,
    expiresAt: new Date(nowMs + RESET_TTL_MS),
  };
}

/**
 * Tudo numa transação com a conta travada: ou a recuperação inteira vale, ou
 * nada muda. Conta sem fator, sem senha e com link novo é o único estado final.
 */
export function recoverSuperAdmin(
  db: AppDb,
  options: RecoverSuperAdminOptions,
): Promise<RecoverSuperAdminResult> {
  return db.transaction(async (tx) => {
    const account = await lockSuperAdmin(tx);
    const plan = await buildPlan(tx, account, options.newEmail);
    if (!options.confirm) return { applied: false, plan };
    const issued = await applyRecovery(tx, account, plan, options);
    return { applied: true, plan, ...issued };
  });
}

export const RECOVER_USAGE = [
  'Uso: npm run admin:recover -- [--novo-email=<e-mail>] [--confirmar]',
  '  Precisa de DATABASE_URL e APP_URL (https://).',
  '  Sem --confirmar, só simula e mostra o que faria.',
].join('\n');

export interface RecoverCliDeps {
  env: Readonly<Record<string, string | undefined>>;
  openDb: () => Promise<AppDb>;
  out: (line: string) => void;
  err: (line: string) => void;
  auditEventsFor?: RecoverSuperAdminOptions['auditEventsFor'];
}

function parseCliArgs(
  argv: string[],
): { newEmail?: string; confirm: boolean } | null {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        'novo-email': { type: 'string' },
        confirmar: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    });
    return { newEmail: values['novo-email'], confirm: values.confirmar };
  } catch {
    return null;
  }
}

function describePlan(plan: RecoveryPlan): string[] {
  return [
    `Conta super_admin: ${plan.currentEmail}`,
    plan.newEmail
      ? `E-mail passa a ser: ${plan.newEmail}`
      : 'E-mail: sem troca',
    plan.hadFactor
      ? 'Segundo fator e códigos de recuperação: removidos'
      : 'Segundo fator: não havia',
    'Senha atual: invalidada · sessões abertas: derrubadas (em até 60 s)',
    ...(plan.wasInactive ? ['Conta estava desativada: reativada'] : []),
  ];
}

function reportResult(
  result: RecoverSuperAdminResult,
  out: (line: string) => void,
): void {
  for (const line of describePlan(result.plan)) out(line);
  if (!result.applied) {
    out(DRY_RUN_MESSAGE);
    return;
  }
  out('');
  out('Link para definir a nova senha (vale 1 hora, uso único):');
  out(result.link);
  out('');
  out(
    'Depois de definir a senha, entre em /login: o sistema exige cadastrar o autenticador de novo.',
  );
}

/**
 * Linha de comando: `0` aplicado ou simulado, `2` uso ou pré-condição
 * (nada gravado), `1` falha inesperada — banco não abriu (nenhuma transação
 * chegou a existir) ou transação desfeita depois de abrir.
 */
export async function runRecoverSuperAdminCli(
  argv: string[],
  deps: RecoverCliDeps,
): Promise<number> {
  const args = parseCliArgs(argv);
  if (!args) {
    deps.err(RECOVER_USAGE);
    return 2;
  }
  const appUrl = deps.env.APP_URL;
  if (!appUrl || !isSafeOrigin(appUrl)) {
    deps.err(
      'Defina APP_URL com a URL pública https:// da aplicação — o link de definir senha é montado com ela.',
    );
    return 2;
  }
  let db: AppDb;
  try {
    db = await deps.openDb();
  } catch (error) {
    deps.err(DB_CONNECTION_FAILED_MESSAGE);
    deps.err(String(error instanceof Error ? error.stack : error));
    return 1;
  }
  try {
    const result = await recoverSuperAdmin(db, {
      appUrl,
      newEmail: args.newEmail,
      confirm: args.confirm,
      auditEventsFor: deps.auditEventsFor,
    });
    reportResult(result, deps.out);
    return 0;
  } catch (error) {
    if (error instanceof RecoveryPreconditionError) {
      deps.err(error.message);
      return 2;
    }
    deps.err(ROLLED_BACK_MESSAGE);
    deps.err(String(error instanceof Error ? error.stack : error));
    return 1;
  }
}
