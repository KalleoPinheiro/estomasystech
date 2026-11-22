import type { ProfessionalPatientLinkRepository } from '@/domain/clinical/professional-patient-link';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import {
  type DuplicateCandidate,
  MAX_POSSIBLE_DUPLICATES,
} from '@/domain/patient/possible-duplicates';

export interface FindPossibleDuplicatesInput extends DuplicateCandidate {
  /**
   * Quem cadastra é Profissional (R4): só os pacientes com vínculo aparecem.
   * `null` é Profissional sem cadastro de profissional, que não vê nenhum.
   */
  professionalId?: string | null;
}

/**
 * Aviso de paciente repetido antes do cadastro (#992). Não bloqueia nada: só
 * lista quem a equipe pode querer usar no lugar de um cadastro novo.
 */
export class FindPossibleDuplicates {
  constructor(
    private readonly patients: PatientRepository,
    private readonly links: ProfessionalPatientLinkRepository,
  ) {}

  async execute(input: FindPossibleDuplicatesInput): Promise<Patient[]> {
    const { professionalId, ...candidate } = input;
    const allowed = await this.allowedIds(professionalId);
    if (allowed?.size === 0) return [];
    const found = await this.patients.findPossibleDuplicates(candidate);
    return found
      .filter((patient) => !allowed || allowed.has(patient.id))
      .slice(0, MAX_POSSIBLE_DUPLICATES);
  }

  private async allowedIds(
    professionalId: string | null | undefined,
  ): Promise<Set<string> | null> {
    if (professionalId === undefined) return null;
    if (professionalId === null) return new Set();
    return new Set(await this.links.findLinkedPatientIds(professionalId));
  }
}
