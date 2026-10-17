import type { ProfessionalRepository } from '@/domain/professional/professional-repository';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';

/**
 * Profissional informado numa consulta ou ausência precisa existir na empresa
 * e estar ativo (issue #219). A FK de `professional_id` é global; o
 * repositório com escopo da clínica é o que barra id de outra empresa.
 */
export async function assertActiveProfessional(
  professionals: ProfessionalRepository,
  professionalId: string,
  inactiveMessage = 'Profissional inativo não pode ser escolhido',
): Promise<void> {
  const professional = await professionals.findById(professionalId);
  if (!professional) {
    throw new NotFoundError('Profissional', professionalId);
  }
  if (!professional.isActive) {
    throw new ValidationError(inactiveMessage);
  }
}
