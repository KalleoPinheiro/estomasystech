import type { ClinicNursingDiagnosis } from '@/domain/taxonomy/clinic-nursing-diagnosis';
import type { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import type {
  ClinicNursingDiagnosisRepository,
  NursingDiagnosisRepository,
} from '@/domain/taxonomy/taxonomy-repositories';

export interface DiagnosisOptions {
  clinic: ClinicNursingDiagnosis[];
  global: NursingDiagnosis[];
}

/**
 * Busca do plano de cuidados (#954): o catálogo da clínica vem primeiro (é o que ela usa no dia a
 * dia), depois o global. Item da clínica com o mesmo código de um global esconde o global.
 */
export class SearchDiagnosisOptions {
  constructor(
    private readonly global: NursingDiagnosisRepository,
    private readonly clinic: ClinicNursingDiagnosisRepository,
  ) {}

  async execute(input: {
    term: string;
    limit?: number;
  }): Promise<DiagnosisOptions> {
    const options = { limit: input.limit };
    const [clinic, global] = await Promise.all([
      this.clinic.search(input.term, options),
      this.global.search(input.term, options),
    ]);
    const clinicCodes = new Set(clinic.map((item) => item.code));
    return {
      clinic,
      global: global.filter((item) => !clinicCodes.has(item.code)),
    };
  }
}
