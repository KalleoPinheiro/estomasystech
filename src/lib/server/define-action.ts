import 'server-only';
import { refresh } from 'next/cache';
import type { z } from 'zod';
import type { TransactionScope } from '@/application/ports/transaction-manager';
import type { UserRole } from '@/domain/auth/user-role';
import { getRepositories } from '@/infrastructure/container';
import type { ActionResult } from '@/lib/action-result';
import { describeFailure } from '@/lib/api-response';
import { type AuditInput, recordAuditNow } from '@/lib/audit';
import {
  STAFF_ONLY_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
} from '@/lib/auth/access-policy';
import type { Session } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/staff-roles';
import { type TenantScope, writeScope } from '@/lib/auth/tenant-scope';
import { readSession } from '@/lib/server/session';

/** Quem pode executar: a mesma divisão de famílias das guardas de página. */
export type ActionAccess =
  | { kind: 'staff'; roles?: readonly UserRole[] }
  | { kind: 'portal'; roles?: readonly UserRole[] }
  | { kind: 'platform' };

export interface ActionContext<I> {
  input: I;
  session: Session;
  /** Escopo de ESCRITA da empresa da sessão (regra 1): passe a `getRepositories`. */
  scope: TenantScope;
}

interface ActionBase<S extends z.ZodType> {
  access: ActionAccess;
  input: S;
  /**
   * Autorização do RECURSO (ex.: vínculo do Profissional com o paciente, R4),
   * depois do `zod` e ANTES da gravação: lança `ForbiddenError`/`NotFoundError`
   * e nada é aberto nem gravado. Roda fora da transação, então pode ler com
   * `getRepositories(scope)`.
   */
  authorize?: (context: ActionContext<z.output<S>>) => Promise<void>;
}

/**
 * Ação que grava dado de clínica ou de pessoa. O `handler` roda DENTRO de uma
 * transação e grava só pelos repositórios de `tx`; a auditoria entra na MESMA
 * transação (ADR-075): se a trilha falha, a gravação inteira é desfeita e a
 * ação responde erro. Nunca fica gravação sem trilha (LGPD).
 */
export interface AuditedActionDefinition<S extends z.ZodType, R>
  extends ActionBase<S> {
  handler: (
    context: ActionContext<z.output<S>> & { tx: TransactionScope },
  ) => Promise<R>;
  /**
   * Evento do que foi gravado; é persistido antes do commit, junto com a
   * gravação. `null` quando o handler decidiu não gravar nada (repetição
   * idempotente): sem gravação não há o que auditar.
   */
  audit: (done: { input: z.output<S>; result: R }) => AuditInput | null;
}

/**
 * Leitura, ou ação que não toca dado de clínica nem de pessoa: sem transação e
 * sem auditoria (`audit: false` é decisão explícita, não esquecimento).
 */
export interface UnauditedActionDefinition<S extends z.ZodType, R>
  extends ActionBase<S> {
  handler: (context: ActionContext<z.output<S>>) => Promise<R>;
  audit: false;
}

export type ActionDefinition<S extends z.ZodType, R> =
  | AuditedActionDefinition<S, R>
  | UnauditedActionDefinition<S, R>;

const PORTAL_ROLES: readonly UserRole[] = ['patient', 'guardian', 'partner'];
const FORBIDDEN_MESSAGE = 'Seu papel não tem acesso a este recurso';

const failure = (error: string): ActionResult<never> => ({
  success: false,
  data: null,
  error,
});

/** Mensagem de recusa, ou `null` quando a sessão pode executar a ação. */
function denial(access: ActionAccess, session: Session): string | null {
  if (access.kind === 'platform') {
    return session.role === 'super_admin' ? null : STAFF_ONLY_MESSAGE;
  }
  const family =
    access.kind === 'staff'
      ? isStaffRole(session.role) && session.role !== 'super_admin'
      : PORTAL_ROLES.includes(session.role);
  if (!family) return STAFF_ONLY_MESSAGE;
  return access.roles && !access.roles.includes(session.role)
    ? FORBIDDEN_MESSAGE
    : null;
}

/** Roda o handler e a auditoria na mesma transação: tudo persiste ou nada persiste. */
async function runAudited<S extends z.ZodType, R>(
  definition: AuditedActionDefinition<S, R>,
  context: ActionContext<z.output<S>>,
): Promise<R> {
  const { transactions } = await getRepositories(context.scope);
  return transactions.run(async (tx) => {
    const result = await definition.handler({ ...context, tx });
    const event = definition.audit({ input: context.input, result });
    if (event) await recordAuditNow(tx.auditEvents, context.session, event);
    return result;
  });
}

/**
 * Server Action com o mesmo contrato das rotas (ADR-069 § 2). Uma ação é um
 * endpoint público, então TUDO acontece aqui dentro, nesta ordem, e nada é
 * gravado antes da guarda passar:
 *
 * 1. sessão (cookie + revogação) e papel — falha fechado, envelope de erro;
 * 2. `zod` na entrada — a entrada do cliente nunca é confiável;
 * 3. o `handler`, com o escopo de ESCRITA da empresa da sessão (`writeScope`);
 * 4. auditoria do que foi gravado, na mesma transação da gravação (ADR-075):
 *    falhou a trilha, nada fica gravado e a ação responde erro;
 * 5. `refresh()`: a tela atualiza sozinha, sem `router.refresh()` no cliente.
 *
 * Uso: `export const salvar = defineAction({ ... })` num arquivo `'use server'`.
 */
export function defineAction<S extends z.ZodType, R>(
  definition: AuditedActionDefinition<S, R>,
): (input: z.input<S>) => Promise<ActionResult<R>>;
export function defineAction<S extends z.ZodType, R>(
  definition: UnauditedActionDefinition<S, R>,
): (input: z.input<S>) => Promise<ActionResult<R>>;
export function defineAction<S extends z.ZodType, R>(
  definition: ActionDefinition<S, R>,
): (input: z.input<S>) => Promise<ActionResult<R>> {
  return async (rawInput) => {
    const state = await readSession();
    if (state.status === 'anonymous') {
      return failure(UNAUTHENTICATED_MESSAGE);
    }
    const { session } = state;
    const refusal = denial(definition.access, session);
    if (refusal) return failure(refusal);

    const parsed = definition.input.safeParse(rawInput);
    if (!parsed.success) {
      return failure(describeFailure(parsed.error).message);
    }

    try {
      const context = {
        input: parsed.data,
        session,
        scope: writeScope(session),
      };
      await definition.authorize?.(context);
      const result = definition.audit
        ? await runAudited(definition, context)
        : await definition.handler(context);
      refresh();
      return { success: true, data: result, error: null };
    } catch (error) {
      return failure(describeFailure(error).message);
    }
  };
}
