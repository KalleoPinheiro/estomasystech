import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { assertValidGuardian } from './assert-valid-guardian';
import { assertValidReferrer } from './assert-valid-referrer';

export interface CreatePatientInput {
  fullName: string;
  /** Opcional e repetível entre pacientes (#325). */
  email?: string | null;
  phone: string;
  birthDate?: Date | null;
  notes?: string | null;
  referredByPartnerId?: string | null;
  guardianId?: string | null;
}

export class CreatePatient {
  constructor(
    private readonly patients: PatientRepository,
    private readonly partners?: PartnerRepository,
    private readonly guardians?: GuardianRepository,
  ) {}

  async execute(input: CreatePatientInput): Promise<Patient> {
    await assertValidReferrer(this.partners, input.referredByPartnerId);
    await assertValidGuardian(this.guardians, input.guardianId);
    const patient = Patient.create(input);
    await this.patients.save(patient);
    return patient;
  }
}
