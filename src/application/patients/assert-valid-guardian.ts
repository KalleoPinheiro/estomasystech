import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import { ValidationError } from '@/domain/shared/errors';

/** O vínculo só aceita responsável cadastrado na mesma empresa (o repositório é escopado). */
export async function assertValidGuardian(
  guardians: GuardianRepository | undefined,
  guardianId: string | null | undefined,
): Promise<void> {
  if (!guardianId || !guardians) {
    return;
  }
  if (!(await guardians.findById(guardianId))) {
    throw new ValidationError('Responsável não encontrado');
  }
}
