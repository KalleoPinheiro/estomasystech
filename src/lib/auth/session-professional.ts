import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { Session } from './session';

/**
 * Autoria de registro clínico: sempre o profissional da conta autenticada,
 * nunca um campo do corpo da requisição (issues #64 e #200). Sem isso qualquer
 * papel podia atribuir evolução ou registro do plano de cuidados (SAE) a outro
 * profissional — autoria forjada, risco de compliance com o COFEN.
 *
 * Profissional: o `professionalId` da sessão. Demais papéis: o profissional
 * vinculado à conta (ou `null` quando a conta não é de profissional).
 * Registrar "em nome de" outro profissional não existe — decisão de produto
 * em aberto, não uma regra deste helper.
 */
export async function resolveSessionProfessionalId(
  session: Session | null | undefined,
  userAccounts: UserAccountRepository,
): Promise<string | null> {
  if (session?.role === 'profissional') {
    return session.professionalId;
  }
  const subject = session?.subject;
  if (!subject || subject === 'local') {
    return null;
  }
  const account = await userAccounts.findByEmail(subject);
  return account?.professionalId ?? null;
}
