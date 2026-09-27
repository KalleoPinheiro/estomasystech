import type { CreateAccountActor } from '@/application/auth/create-account';
import type { AccountManager } from '@/domain/auth/account-management';

/**
 * O operador da plataforma como ator de provisionamento (ADR-007). Só o
 * super_admin chega às rotas de `platform`: a família barra os demais papéis.
 */
export const PLATFORM_ACTOR: CreateAccountActor = {
  role: 'super_admin',
  clinicId: null,
};

/**
 * Gestão de admin pela plataforma. `subject: null`: a conta do operador nunca é
 * a do admin da clínica, mesmo que o e-mail coincida (B1, Unresolved 4) — a
 * regra "não desativar a própria conta" não se aplica.
 */
export const PLATFORM_ACCOUNT_MANAGER: AccountManager = {
  role: 'super_admin',
  subject: null,
};
