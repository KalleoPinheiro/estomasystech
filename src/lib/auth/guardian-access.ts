import { ForbiddenError } from '@/domain/shared/errors';
import type { Session } from './session';

/** Quem cadastra, edita, exclui e vincula responsáveis (#329): a recepção e o Admin. */
export const GUARDIAN_MANAGER_ROLES: readonly string[] = [
  'company_admin',
  'atendente',
];

export const GUARDIAN_FORBIDDEN_MESSAGE =
  'Só o Admin de Empresa e o Atendente gerenciam responsáveis';

/** Sem sessão (modo aberto, só dev) passa: a barreira é a autenticação. */
export function assertCanManageGuardians(session: Session | null): void {
  if (session && !GUARDIAN_MANAGER_ROLES.includes(session.role)) {
    throw new ForbiddenError(GUARDIAN_FORBIDDEN_MESSAGE);
  }
}
