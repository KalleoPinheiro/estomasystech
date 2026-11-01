'use server';

import { z } from 'zod';
import { AddConditionAssessment } from '@/application/clinical/add-condition-assessment';
import { AddEvolutionNote } from '@/application/clinical/add-evolution-note';
import { CreateCondition } from '@/application/clinical/create-condition';
import { ResolveCondition } from '@/application/clinical/resolve-condition';
import { resolveSessionProfessionalId } from '@/lib/auth/session-professional';
import { CLINIC_STAFF_ROLES } from '@/lib/auth/staff-roles';
import { toAssessmentDto, toConditionDto, toEvolutionNoteDto } from '@/lib/dto';
import {
  assessmentSchema,
  conditionSchema,
  evolutionSchema,
} from '@/lib/patient-record-schemas';
import { defineAction } from '@/lib/server/define-action';
import {
  authorizeClinicalResource,
  authorizePatientAccess,
} from '@/lib/server/ficha-authorization';
import { canRoleAccess } from '@/lib/staff-pages';

/**
 * Prontuário na ficha (#552, ADR-080): condição, avaliação seriada e evolução.
 * A gravação e a trilha vão na MESMA transação; o Profissional só age sobre
 * paciente com vínculo (R4) e a autoria da evolução vem da sessão (#64).
 */

const PATIENT_ROLES = CLINIC_STAFF_ROLES.filter((role) =>
  canRoleAccess('/api/patients', role),
);
const CONDITION_ROLES = CLINIC_STAFF_ROLES.filter((role) =>
  canRoleAccess('/api/conditions', role),
);

const idSchema = z.string().min(1).max(100);

export const createCondition = defineAction({
  access: { kind: 'staff', roles: PATIENT_ROLES },
  input: z.object({ patientId: idSchema, body: conditionSchema }),
  authorize: (context) =>
    authorizePatientAccess(context, context.input.patientId),
  handler: async ({ input, tx }) => {
    const { body } = input;
    const condition = await new CreateCondition(
      tx.conditions,
      tx.patients,
    ).execute({
      patientId: input.patientId,
      kind: body.kind,
      title: body.title,
      stomaType: body.stomaType ?? null,
      startedAt: body.startedAt ? new Date(body.startedAt) : null,
      notes: body.notes ?? null,
    });
    return toConditionDto(condition);
  },
  audit: ({ input, result }) => ({
    action: 'create',
    resourceType: 'condition',
    resourceId: result.id,
    patientId: input.patientId,
  }),
});

export const resolveCondition = defineAction({
  access: { kind: 'staff', roles: CONDITION_ROLES },
  input: z.object({ id: idSchema }),
  authorize: (context) =>
    authorizeClinicalResource(context, 'condition', context.input.id),
  handler: async ({ input, tx }) =>
    toConditionDto(await new ResolveCondition(tx.conditions).execute(input)),
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'condition',
    resourceId: result.id,
    patientId: result.patientId,
    detail: 'resolvida',
  }),
});

export const addConditionAssessment = defineAction({
  access: { kind: 'staff', roles: CONDITION_ROLES },
  input: z.object({ id: idSchema, body: assessmentSchema }),
  authorize: (context) =>
    authorizeClinicalResource(context, 'condition', context.input.id),
  handler: async ({ input, tx }) => {
    const assessment = await new AddConditionAssessment(
      tx.assessments,
      tx.conditions,
    ).execute({ conditionId: input.id, ...input.body });
    const condition = await tx.conditions.findById(input.id);
    return {
      assessment: toAssessmentDto(assessment),
      patientId: condition?.patientId ?? null,
    };
  },
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'assessment',
    resourceId: result.assessment.id,
    patientId: result.patientId,
  }),
});

export const addEvolutionNote = defineAction({
  access: { kind: 'staff', roles: PATIENT_ROLES },
  input: z.object({ patientId: idSchema, body: evolutionSchema }),
  authorize: (context) =>
    authorizePatientAccess(context, context.input.patientId),
  handler: async ({ input, session, tx }) => {
    // Autoria pela sessão (#64): o corpo nunca escolhe o profissional.
    const professionalId = await resolveSessionProfessionalId(
      session,
      tx.userAccounts,
    );
    const note = await new AddEvolutionNote(tx.evolutions, tx.patients).execute(
      {
        patientId: input.patientId,
        appointmentId: input.body.appointmentId ?? null,
        professionalId,
        subjective: input.body.subjective,
        objective: input.body.objective,
        assessment: input.body.assessment,
        plan: input.body.plan,
      },
    );
    // Nota de evolução com profissional concede/renova o vínculo (RBAC-19/20).
    if (professionalId) {
      await tx.professionalPatientLinks.ensureLink(
        professionalId,
        input.patientId,
      );
    }
    return toEvolutionNoteDto(note);
  },
  audit: ({ input, result }) => ({
    action: 'create',
    resourceType: 'evolution',
    resourceId: result.id,
    patientId: input.patientId,
  }),
});
