'use server';

import { z } from 'zod';
import { AddCarePlanDiagnosis } from '@/application/clinical/add-care-plan-diagnosis';
import { EvaluateOutcome } from '@/application/clinical/evaluate-outcome';
import { OpenCarePlan } from '@/application/clinical/open-care-plan';
import { PrescribeIntervention } from '@/application/clinical/prescribe-intervention';
import { PrescribeOutcome } from '@/application/clinical/prescribe-outcome';
import { RecordIntervention } from '@/application/clinical/record-intervention';
import { ResolveCarePlan } from '@/application/clinical/resolve-care-plan';
import { resolveSessionProfessionalId } from '@/lib/auth/session-professional';
import { CLINIC_STAFF_ROLES } from '@/lib/auth/staff-roles';
import {
  toCarePlanDiagnosisDto,
  toCarePlanDto,
  toCarePlanInterventionDto,
  toCarePlanOutcomeDto,
  toInterventionRecordDto,
  toOutcomeEvaluationDto,
} from '@/lib/dto';
import {
  diagnosisSchema,
  evaluationSchema,
  interventionSchema,
  openCarePlanSchema,
  outcomeSchema,
  recordSchema,
} from '@/lib/patient-record-schemas';
import { defineAction } from '@/lib/server/define-action';
import {
  authorizeClinicalResource,
  authorizePatientAccess,
} from '@/lib/server/ficha-authorization';
import { canRoleAccess } from '@/lib/staff-pages';

/**
 * Plano de cuidados (SAE) na ficha (#552, ADR-080): abrir, resolver e
 * prescrever/avaliar/registrar. A gravação e a trilha vão na MESMA transação.
 * O Profissional só age sobre plano de paciente com vínculo (R4) e a autoria
 * vem da sessão (#200). O `patientId` da trilha é o do plano, nunca do corpo.
 */

const idSchema = z.string().min(1).max(100);
const rolesFor = (api: string) =>
  CLINIC_STAFF_ROLES.filter((role) => canRoleAccess(api, role));

const PATIENT_ROLES = rolesFor('/api/patients');
const PLAN_ROLES = rolesFor('/api/care-plans');
const INTERVENTION_ROLES = rolesFor('/api/care-plan-interventions');
const OUTCOME_ROLES = rolesFor('/api/care-plan-outcomes');

export const openCarePlan = defineAction({
  access: { kind: 'staff', roles: PATIENT_ROLES },
  input: z.object({ patientId: idSchema, body: openCarePlanSchema }),
  authorize: (context) =>
    authorizePatientAccess(context, context.input.patientId),
  handler: async ({ input, session, tx }) =>
    toCarePlanDto(
      await new OpenCarePlan(tx.carePlans, tx.patients, tx.conditions).execute({
        patientId: input.patientId,
        conditionId: input.body.conditionId ?? null,
        professionalId: await resolveSessionProfessionalId(
          session,
          tx.userAccounts,
        ),
      }),
    ),
  audit: ({ input, result }) => ({
    action: 'create',
    resourceType: 'care_plan',
    resourceId: result.id,
    patientId: input.patientId,
  }),
});

export const resolveCarePlan = defineAction({
  access: { kind: 'staff', roles: PLAN_ROLES },
  input: z.object({ id: idSchema }),
  authorize: (context) =>
    authorizeClinicalResource(context, 'carePlan', context.input.id),
  handler: async ({ input, tx }) =>
    toCarePlanDto(await new ResolveCarePlan(tx.carePlans).execute(input)),
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'care_plan',
    resourceId: result.id,
    patientId: result.patientId,
    detail: 'resolvido',
  }),
});

/** Plano → paciente, dentro da transação, para a trilha. */
async function patientOfPlan(
  planId: string,
  tx: {
    carePlans: { findById(id: string): Promise<{ patientId: string } | null> };
  },
) {
  return (await tx.carePlans.findById(planId))?.patientId ?? null;
}

export const addCarePlanDiagnosis = defineAction({
  access: { kind: 'staff', roles: PLAN_ROLES },
  input: z.object({ id: idSchema, body: diagnosisSchema }),
  authorize: (context) =>
    authorizeClinicalResource(context, 'carePlan', context.input.id),
  handler: async ({ input, tx }) => {
    const { body } = input;
    const diagnosis = await new AddCarePlanDiagnosis(
      tx.carePlanDiagnoses,
      tx.carePlans,
      tx.nursingDiagnoses,
    ).execute({
      carePlanId: input.id,
      diagnosisCode: body.diagnosisCode,
      type: body.type,
      relatedFactors: body.relatedFactors ?? null,
      definingCharacteristics: body.definingCharacteristics ?? null,
    });
    const catalogEntry = await tx.nursingDiagnoses.findByCode(
      body.diagnosisCode,
    );
    return {
      diagnosis: toCarePlanDiagnosisDto(
        diagnosis,
        catalogEntry?.label ?? diagnosis.diagnosisCode,
      ),
      patientId: await patientOfPlan(input.id, tx),
    };
  },
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'care_plan_diagnosis',
    resourceId: result.diagnosis.id,
    patientId: result.patientId,
  }),
});

export const prescribeCarePlanOutcome = defineAction({
  access: { kind: 'staff', roles: PLAN_ROLES },
  input: z.object({ id: idSchema, body: outcomeSchema }),
  authorize: (context) =>
    authorizeClinicalResource(context, 'carePlan', context.input.id),
  handler: async ({ input, tx }) => {
    const { body } = input;
    const outcome = await new PrescribeOutcome(
      tx.carePlanOutcomes,
      tx.carePlans,
      tx.nursingOutcomes,
    ).execute({
      carePlanId: input.id,
      outcomeCode: body.outcomeCode,
      baselineScore: body.baselineScore,
      targetScore: body.targetScore,
      deadline: body.deadline ? new Date(body.deadline) : null,
    });
    const catalogEntry = await tx.nursingOutcomes.findByCode(body.outcomeCode);
    return {
      outcome: toCarePlanOutcomeDto(outcome, [], catalogEntry),
      patientId: await patientOfPlan(input.id, tx),
    };
  },
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'care_plan_outcome',
    resourceId: result.outcome.id,
    patientId: result.patientId,
  }),
});

export const prescribeCarePlanIntervention = defineAction({
  access: { kind: 'staff', roles: PLAN_ROLES },
  input: z.object({ id: idSchema, body: interventionSchema }),
  authorize: (context) =>
    authorizeClinicalResource(context, 'carePlan', context.input.id),
  handler: async ({ input, tx }) => {
    const { body } = input;
    const intervention = await new PrescribeIntervention(
      tx.carePlanInterventions,
      tx.carePlans,
      tx.nursingInterventions,
    ).execute({
      carePlanId: input.id,
      interventionCode: body.interventionCode,
      frequency: body.frequency,
      priority: body.priority,
    });
    const catalogEntry = await tx.nursingInterventions.findByCode(
      body.interventionCode,
    );
    return {
      intervention: toCarePlanInterventionDto(
        intervention,
        [],
        catalogEntry?.label ?? intervention.interventionCode,
      ),
      patientId: await patientOfPlan(input.id, tx),
    };
  },
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'care_plan_intervention',
    resourceId: result.intervention.id,
    patientId: result.patientId,
  }),
});

export const recordCarePlanIntervention = defineAction({
  access: { kind: 'staff', roles: INTERVENTION_ROLES },
  input: z.object({ id: idSchema, body: recordSchema }),
  authorize: (context) =>
    authorizeClinicalResource(
      context,
      'carePlanIntervention',
      context.input.id,
    ),
  handler: async ({ input, session, tx }) => {
    const record = await new RecordIntervention(
      tx.interventionRecords,
      tx.carePlanInterventions,
      tx.carePlans,
    ).execute({
      interventionId: input.id,
      professionalId: await resolveSessionProfessionalId(
        session,
        tx.userAccounts,
      ),
      notes: input.body.notes ?? null,
    });
    const intervention = await tx.carePlanInterventions.findById(input.id);
    return {
      record: toInterventionRecordDto(record),
      patientId: intervention
        ? await patientOfPlan(intervention.carePlanId, tx)
        : null,
    };
  },
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'intervention_record',
    resourceId: result.record.id,
    patientId: result.patientId,
  }),
});

export const evaluateCarePlanOutcome = defineAction({
  access: { kind: 'staff', roles: OUTCOME_ROLES },
  input: z.object({ id: idSchema, body: evaluationSchema }),
  authorize: (context) =>
    authorizeClinicalResource(context, 'carePlanOutcome', context.input.id),
  handler: async ({ input, session, tx }) => {
    const evaluation = await new EvaluateOutcome(
      tx.outcomeEvaluations,
      tx.carePlanOutcomes,
      tx.carePlans,
    ).execute({
      outcomeId: input.id,
      score: input.body.score,
      professionalId: await resolveSessionProfessionalId(
        session,
        tx.userAccounts,
      ),
      notes: input.body.notes ?? null,
    });
    const outcome = await tx.carePlanOutcomes.findById(input.id);
    return {
      evaluation: toOutcomeEvaluationDto(evaluation),
      patientId: outcome ? await patientOfPlan(outcome.carePlanId, tx) : null,
    };
  },
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'outcome_evaluation',
    resourceId: result.evaluation.id,
    patientId: result.patientId,
  }),
});
