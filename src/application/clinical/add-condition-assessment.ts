import type {
  ClinicalConditionRepository,
  ConditionAssessmentRepository,
} from '@/domain/clinical/clinical-repositories';
import {
  ConditionAssessment,
  type ExudateLevel,
} from '@/domain/clinical/condition-assessment';
import type { WoundTimeProps } from '@/domain/clinical/wound-time';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';

export interface AddConditionAssessmentInput extends WoundTimeProps {
  conditionId: string;
  lengthMm?: number | null;
  widthMm?: number | null;
  depthMm?: number | null;
  tissueType?: string | null;
  exudate?: ExudateLevel | null;
  painScale?: number | null;
  skinCondition?: string | null;
  complications?: string | null;
  notes?: string | null;
}

export class AddConditionAssessment {
  constructor(
    private readonly assessments: ConditionAssessmentRepository,
    private readonly conditions: ClinicalConditionRepository,
  ) {}

  async execute(
    input: AddConditionAssessmentInput,
  ): Promise<ConditionAssessment> {
    const condition = await this.conditions.findById(input.conditionId);
    if (!condition) {
      throw new NotFoundError('Condição clínica', input.conditionId);
    }
    if (!condition.isActive) {
      throw new ValidationError('Não é possível avaliar condição já resolvida');
    }
    const assessment = ConditionAssessment.create(input);
    await this.assessments.save(assessment);
    return assessment;
  }
}
