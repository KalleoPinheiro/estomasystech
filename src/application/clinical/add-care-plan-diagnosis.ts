import {
  CarePlanDiagnosis,
  type CarePlanDiagnosisType,
} from '@/domain/clinical/care-plan-diagnosis';
import type {
  CarePlanDiagnosisRepository,
  CarePlanRepository,
} from '@/domain/clinical/clinical-repositories';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import type {
  ClinicNursingDiagnosisRepository,
  NursingDiagnosisRepository,
} from '@/domain/taxonomy/taxonomy-repositories';

/**
 * De onde vem o diagnóstico (#954), em ordem: item do catálogo da clínica (`clinicDiagnosisId`),
 * código do catálogo global (`diagnosisCode`) ou título digitado à mão (`diagnosisLabel`, "sem código").
 */
export interface AddCarePlanDiagnosisInput {
  carePlanId: string;
  diagnosisCode?: string | null;
  clinicDiagnosisId?: string | null;
  diagnosisLabel?: string | null;
  type: CarePlanDiagnosisType;
  relatedFactors?: string | null;
  definingCharacteristics?: string | null;
}

interface DiagnosisIdentity {
  diagnosisCode: string | null;
  diagnosisLabel: string | null;
}

export class AddCarePlanDiagnosis {
  constructor(
    private readonly diagnoses: CarePlanDiagnosisRepository,
    private readonly carePlans: CarePlanRepository,
    private readonly catalog: NursingDiagnosisRepository,
    private readonly clinicCatalog?: ClinicNursingDiagnosisRepository,
  ) {}

  async execute(input: AddCarePlanDiagnosisInput): Promise<CarePlanDiagnosis> {
    const plan = await this.carePlans.findById(input.carePlanId);
    if (!plan) {
      throw new NotFoundError('Plano de cuidados', input.carePlanId);
    }
    if (!plan.isActive) {
      throw new ValidationError('Plano de cuidados não está ativo');
    }
    const identity = await this.resolveIdentity(input);
    const diagnosis = CarePlanDiagnosis.create({
      carePlanId: input.carePlanId,
      type: input.type,
      relatedFactors: input.relatedFactors,
      definingCharacteristics: input.definingCharacteristics,
      ...identity,
    });
    await this.diagnoses.save(diagnosis);
    return diagnosis;
  }

  private async resolveIdentity(
    input: AddCarePlanDiagnosisInput,
  ): Promise<DiagnosisIdentity> {
    if (input.clinicDiagnosisId) {
      return this.fromClinicCatalog(input.clinicDiagnosisId);
    }
    if (input.diagnosisCode) {
      const catalogEntry = await this.catalog.findByCode(input.diagnosisCode);
      if (!catalogEntry) {
        throw new NotFoundError('Diagnóstico NANDA-I', input.diagnosisCode);
      }
      return { diagnosisCode: input.diagnosisCode, diagnosisLabel: null };
    }
    return { diagnosisCode: null, diagnosisLabel: input.diagnosisLabel ?? null };
  }

  /** Copia código e título para o plano: editar ou desativar o item depois não altera o prontuário. */
  private async fromClinicCatalog(id: string): Promise<DiagnosisIdentity> {
    const entry = await this.clinicCatalog?.findById(id);
    if (!entry?.isActive) {
      throw new NotFoundError('Diagnóstico da clínica', id);
    }
    return { diagnosisCode: entry.code, diagnosisLabel: entry.label };
  }
}
