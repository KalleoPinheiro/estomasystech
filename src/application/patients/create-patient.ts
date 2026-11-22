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
  cpf?: string | null;
  birthDate?: Date | null;
  notes?: string | null;
  referredByPartnerId?: string | null;
  guardianId?: string | null;
  /**
   * Cadastro rápido da nova consulta (#972): só nome, celular e nascimento
   * (obrigatório). O paciente fica com o cadastro incompleto.
   */
  quickRegistration?: boolean;
}

export class CreatePatient {
  constructor(
    private readonly patients: PatientRepository,
    private readonly partners?: PartnerRepository,
    private readonly guardians?: GuardianRepository,
  ) {}

  async execute(input: CreatePatientInput): Promise<Patient> {
    const patient = input.quickRegistration
      ? Patient.createQuick({
          fullName: input.fullName,
          phone: input.phone,
          birthDate: input.birthDate ?? null,
        })
      : await this.createFull(input);
    await this.patients.save(patient);
    return patient;
  }

  /** Indicação e responsável só valem no cadastro completo: o rápido os ignora (#972). */
  private async createFull(input: CreatePatientInput): Promise<Patient> {
    await assertValidReferrer(this.partners, input.referredByPartnerId);
    await assertValidGuardian(this.guardians, input.guardianId);
    return Patient.create(input);
  }
}
