import type { UserRole } from '@/domain/auth/user-role';
import type { Clinic } from '@/domain/clinic/clinic';

/** Mensagem ao entrar numa clínica suspensa (B5, design Open 2). */
export const SUSPENDED_CLINIC_MESSAGE =
  'O acesso desta clínica está suspenso. Fale com o responsável pela clínica.';

const PORTAL_ROLES: readonly UserRole[] = ['patient', 'partner', 'guardian'];

/**
 * Paciente e parceiro não conhecem "o responsável" como a equipe conhece: a
 * mensagem do portal leva o contato da clínica (B4), com as partes preenchidas.
 */
export function suspendedClinicMessage(
  role: UserRole,
  clinic: Pick<Clinic, 'contactPhone' | 'contactEmail'> | null,
): string {
  const contact = [
    clinic?.contactPhone && `telefone ${clinic.contactPhone}`,
    clinic?.contactEmail && `e-mail ${clinic.contactEmail}`,
  ].filter(Boolean);
  if (!PORTAL_ROLES.includes(role) || contact.length === 0) {
    return SUSPENDED_CLINIC_MESSAGE;
  }
  return `O acesso desta clínica está suspenso. Fale com o responsável pela clínica: ${contact.join(', ')}.`;
}
