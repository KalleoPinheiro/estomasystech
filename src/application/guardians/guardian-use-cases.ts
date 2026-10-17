import type { UserAccountRepository } from '@/domain/auth/user-account';
import { Guardian, type GuardianProps } from '@/domain/guardian/guardian';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { ConflictError, NotFoundError } from '@/domain/shared/errors';

export class CreateGuardian {
  constructor(private readonly guardians: GuardianRepository) {}

  async execute(input: GuardianProps): Promise<Guardian> {
    const guardian = Guardian.create(input);
    await this.guardians.save(guardian);
    return guardian;
  }
}

export class ListGuardians {
  constructor(private readonly guardians: GuardianRepository) {}

  execute(search?: string): Promise<Guardian[]> {
    return this.guardians.findAll(search?.trim() || undefined);
  }
}

export async function findGuardianOrThrow(
  guardians: GuardianRepository,
  id: string,
): Promise<Guardian> {
  const guardian = await guardians.findById(id);
  if (!guardian) {
    throw new NotFoundError('Responsável', id);
  }
  return guardian;
}

export class GetGuardian {
  constructor(
    private readonly guardians: GuardianRepository,
    private readonly patients: PatientRepository,
  ) {}

  /** O responsável e os pacientes da empresa ligados a ele. */
  async execute(
    id: string,
  ): Promise<{ guardian: Guardian; patients: Patient[] }> {
    const guardian = await findGuardianOrThrow(this.guardians, id);
    return { guardian, patients: await this.patients.findByGuardian(id) };
  }
}

export class UpdateGuardian {
  constructor(private readonly guardians: GuardianRepository) {}

  async execute(
    input: Partial<GuardianProps> & { id: string },
  ): Promise<Guardian> {
    const current = await findGuardianOrThrow(this.guardians, input.id);
    const updated = current.update(input);
    await this.guardians.save(updated);
    return updated;
  }
}

export const GUARDIAN_IN_USE_MESSAGE =
  'Este responsável ainda está ligado a pacientes. Desvincule-os antes de excluir.';

export const GUARDIAN_HAS_ACCOUNT_MESSAGE =
  'Este responsável tem acesso ao portal. Desative a conta dele antes; o cadastro só pode ser apagado quando a conta for anonimizada.';

export class DeleteGuardian {
  constructor(
    private readonly guardians: GuardianRepository,
    private readonly patients: PatientRepository,
    private readonly accounts: UserAccountRepository,
  ) {}

  async execute(id: string): Promise<void> {
    await findGuardianOrThrow(this.guardians, id);
    if ((await this.patients.findByGuardian(id)).length > 0) {
      throw new ConflictError(GUARDIAN_IN_USE_MESSAGE);
    }
    if (await this.accounts.findByPortalLink({ guardianId: id })) {
      throw new ConflictError(GUARDIAN_HAS_ACCOUNT_MESSAGE);
    }
    await this.guardians.delete(id);
  }
}
