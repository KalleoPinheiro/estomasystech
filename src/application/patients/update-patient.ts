import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { NotFoundError } from '@/domain/shared/errors';
import { assertValidGuardian } from './assert-valid-guardian';
import { assertValidReferrer } from './assert-valid-referrer';

export interface UpdatePatientInput {
  id: string;
  fullName?: string;
  /** `undefined` mantém; `null` ou vazio remove o e-mail de contato (#325). */
  email?: string | null;
  phone?: string;
  cpf?: string | null;
  birthDate?: Date | null;
  notes?: string | null;
  referredByPartnerId?: string | null;
  /** `undefined` mantém; `null` desvincula o responsável (#329). */
  guardianId?: string | null;
}

export class UpdatePatient {
  constructor(
    private readonly patients: PatientRepository,
    private readonly partners?: PartnerRepository,
    private readonly guardians?: GuardianRepository,
  ) {}

  async execute(input: UpdatePatientInput): Promise<Patient> {
    const patient = await this.patients.findById(input.id);
    if (!patient) {
      throw new NotFoundError('Paciente', input.id);
    }
    await assertValidReferrer(this.partners, input.referredByPartnerId);
    await assertValidGuardian(this.guardians, input.guardianId);
    const updated = patient.update(input);
    await this.patients.save(updated);
    return updated;
  }
}
