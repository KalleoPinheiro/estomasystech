import 'server-only';
import { refresh } from 'next/cache';
import type { z } from 'zod';
import type { UserRole } from '@/domain/auth/user-role';
import { getRepositories } from '@/infrastructure/container';
import type { ActionResult } from '@/lib/action-result';
import { describeFailure } from '@/lib/api-response';
import { type AuditInput, recordAudit } from '@/lib/audit';
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

export interface ActionDefinition<S extends z.ZodType, R> {
  access: ActionAccess;
  input: S;
  handler: (context: ActionContext<z.output<S>>) => Promise<R>;
  /**
   * Evento de auditoria do que foi gravado, registrado depois do sucesso. A
   * auditoria é decisão explícita: `false` só para ação que não toca dado de
   * clínica nem de pessoa.
   */
  audit: false | ((done: { input: z.output<S>; result: R }) => AuditInput);
}

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

async function recordActionAudit(
  session: Session,
  input: AuditInput,
): Promise<void> {
  const { auditEvents } = await getRepositories(writeScope(session));
  recordAudit(auditEvents, session, input);
}

/**
 * Server Action com o mesmo contrato das rotas (ADR-069 § 2). Uma ação é um
 * endpoint público, então TUDO acontece aqui dentro, nesta ordem, e nada é
 * gravado antes da guarda passar:
 *
 * 1. sessão (cookie + revogação) e papel — falha fechado, envelope de erro;
 * 2. `zod` na entrada — a entrada do cliente nunca é confiável;
 * 3. o `handler`, com o escopo de ESCRITA da empresa da sessão (`writeScope`);
 * 4. auditoria do que foi gravado;
 * 5. `refresh()`: a tela atualiza sozinha, sem `router.refresh()` no cliente.
 *
 * Uso: `export const salvar = defineAction({ ... })` num arquivo `'use server'`.
 */
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
      const result = await definition.handler({
        input: parsed.data,
        session,
        scope: writeScope(session),
      });
      if (definition.audit) {
        await recordActionAudit(
          session,
          definition.audit({ input: parsed.data, result }),
        );
      }
      refresh();
      return { success: true, data: result, error: null };
    } catch (error) {
      return failure(describeFailure(error).message);
    }
  };
}
