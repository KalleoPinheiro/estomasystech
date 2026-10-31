import { z } from 'zod';
import { CARE_PLAN_DIAGNOSIS_TYPES } from '@/domain/clinical/care-plan-diagnosis';
import { INTERVENTION_PRIORITIES } from '@/domain/clinical/care-plan-intervention';
import {
  CONDITION_KINDS,
  STOMA_TYPES,
} from '@/domain/clinical/clinical-condition';
import { EXUDATE_LEVELS } from '@/domain/clinical/condition-assessment';
import {
  EXUDATE_TYPES,
  INFECTION_LEVELS,
  WOUND_EDGES,
} from '@/domain/clinical/wound-time';

/**
 * Entradas das gravações da ficha do paciente (#552, ADR-080): um só `zod` por
 * gravação, usado pela rota `/api` e pela Server Action — a entrada do cliente
 * nunca é confiável e as duas portas validam igual.
 */

export const updatePatientSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().max(200).nullish(),
  phone: z.string().min(1).max(50).optional(),
  // Ausente mantém; vazio ou null remove.
  cpf: z.string().max(20).nullish(),
  birthDate: z.union([z.iso.date(), z.iso.datetime()]).nullish(),
  notes: z.string().max(5000).nullish(),
  referredByPartnerId: z.string().max(100).nullish(),
  guardianId: z.string().max(100).nullish(),
});

export const setActiveSchema = z.object({
  active: z.boolean(),
});

export const anamnesisSchema = z.object({
  comorbidities: z.string().max(5000).optional(),
  allergies: z.string().max(5000).optional(),
  medications: z.string().max(5000).optional(),
  surgicalHistory: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
});

export const evolutionSchema = z.object({
  appointmentId: z.string().nullish(),
  subjective: z.string().max(5000).default(''),
  objective: z.string().max(5000).default(''),
  assessment: z.string().max(5000).default(''),
  plan: z.string().max(5000).default(''),
});

export const conditionSchema = z.object({
  kind: z.enum(CONDITION_KINDS),
  title: z.string().min(1).max(200),
  stomaType: z.enum(STOMA_TYPES).nullish(),
  startedAt: z.iso.datetime().nullish(),
  notes: z.string().max(5000).nullish(),
});

export const detArea = z.number().int().min(0).max(3).nullish();
export const detSeverity = z.number().int().min(0).max(2).nullish();

export const tissuePct = z.number().int().min(0).max(100).nullish();

export const assessmentSchema = z.object({
  lengthMm: z.number().int().min(0).max(10_000).nullish(),
  widthMm: z.number().int().min(0).max(10_000).nullish(),
  depthMm: z.number().int().min(0).max(10_000).nullish(),
  tissueType: z.string().max(200).nullish(),
  exudate: z.enum(EXUDATE_LEVELS).nullish(),
  painScale: z.number().int().min(0).max(10).nullish(),
  skinCondition: z.string().max(1000).nullish(),
  complications: z.string().max(1000).nullish(),
  complicationCodes: z.string().max(500).nullish(),
  detDiscolorationArea: detArea,
  detDiscolorationSeverity: detSeverity,
  detErosionArea: detArea,
  detErosionSeverity: detSeverity,
  detOvergrowthArea: detArea,
  detOvergrowthSeverity: detSeverity,
  infectionLevel: z.enum(INFECTION_LEVELS).nullish(),
  infectionSigns: z.string().max(500).nullish(),
  woundEdges: z.enum(WOUND_EDGES).nullish(),
  exudateType: z.enum(EXUDATE_TYPES).nullish(),
  granulationPct: tissuePct,
  epithelialPct: tissuePct,
  sloughPct: tissuePct,
  necroticPct: tissuePct,
  notes: z.string().max(5000).nullish(),
});

export const openCarePlanSchema = z.object({
  conditionId: z.string().min(1).nullish(),
});

export const diagnosisBodySchema = z.object({
  diagnosisCode: z.string().min(1).max(20),
  type: z.enum(CARE_PLAN_DIAGNOSIS_TYPES),
  relatedFactors: z.string().max(2000).nullish(),
  definingCharacteristics: z.string().max(2000).nullish(),
});

export type DiagnosisBody = z.infer<typeof diagnosisBodySchema>;

export type PesFields = Pick<
  DiagnosisBody,
  'relatedFactors' | 'definingCharacteristics'
>;

function validateRiscoFields(body: PesFields, ctx: z.RefinementCtx): void {
  if (!body.relatedFactors?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['relatedFactors'],
      message: 'Fator relacionado é obrigatório para este tipo de diagnóstico',
    });
  }
  if (body.definingCharacteristics?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['definingCharacteristics'],
      message: 'Diagnóstico de risco não tem características definidoras',
    });
  }
}

function validateRealFields(body: PesFields, ctx: z.RefinementCtx): void {
  if (!body.relatedFactors?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['relatedFactors'],
      message: 'Fator relacionado é obrigatório para este tipo de diagnóstico',
    });
  }
  if (!body.definingCharacteristics?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['definingCharacteristics'],
      message:
        'Característica definidora é obrigatória para este tipo de diagnóstico',
    });
  }
}

function validatePromocaoSaudeFields(
  body: PesFields,
  ctx: z.RefinementCtx,
): void {
  if (body.relatedFactors?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['relatedFactors'],
      message: 'Diagnóstico de promoção da saúde não tem fatores relacionados',
    });
  }
  if (!body.definingCharacteristics?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['definingCharacteristics'],
      message:
        'Característica definidora é obrigatória para este tipo de diagnóstico',
    });
  }
}

/** Espelha as regras PES de `CarePlanDiagnosis` para falhar cedo, com mensagem clara. */
function validatePesFields(body: DiagnosisBody, ctx: z.RefinementCtx): void {
  if (body.type === 'risco') {
    validateRiscoFields(body, ctx);
  } else if (body.type === 'real') {
    validateRealFields(body, ctx);
  } else {
    validatePromocaoSaudeFields(body, ctx);
  }
}

export const diagnosisSchema =
  diagnosisBodySchema.superRefine(validatePesFields);

export const outcomeSchema = z
  .object({
    outcomeCode: z.string().min(1).max(20),
    baselineScore: z.number().int().min(1).max(5),
    targetScore: z.number().int().min(1).max(5),
    deadline: z.iso.datetime().nullish(),
  })
  .refine((body) => body.targetScore > body.baselineScore, {
    error: 'Meta deve ser maior que a pontuação basal',
    path: ['targetScore'],
  });

export const interventionSchema = z.object({
  interventionCode: z.string().min(1).max(20),
  frequency: z.string().min(1).max(500),
  priority: z.enum(INTERVENTION_PRIORITIES),
});

export const recordSchema = z.object({
  notes: z.string().max(2000).nullish(),
});

export const evaluationSchema = z.object({
  score: z.number().int().min(1).max(5),
  notes: z.string().max(2000).nullish(),
});

export type ConditionBody = z.input<typeof conditionSchema>;
export type AssessmentBody = z.input<typeof assessmentSchema>;
