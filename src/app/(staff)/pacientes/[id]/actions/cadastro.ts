'use server';

import { z } from 'zod';
import { UpsertAnamnesis } from '@/application/clinical/upsert-anamnesis';
import {
  CreateGuardian,
  DeleteGuardian,
  UpdateGuardian,
} from '@/application/guardians/guardian-use-cases';
import { UpdatePatient } from '@/application/patients/update-patient';
import { assertCanManageGuardians } from '@/lib/auth/guardian-access';
import { CLINIC_STAFF_ROLES } from '@/lib/auth/staff-roles';
import { toAnamnesisDto, toGuardianDto, toPatientDto } from '@/lib/dto';
import { guardianSchema } from '@/lib/guardian-schema';
import { anamnesisSchema } from '@/lib/patient-record-schemas';
import { defineAction } from '@/lib/server/define-action';
import { authorizePatientAccess } from '@/lib/server/ficha-authorization';
import { canRoleAccess } from '@/lib/staff-pages';

/**
 * Cadastro na ficha do paciente (#552, ADR-080): anamnese e responsável. Cada
 * ação é Server Action com sessão e papel, `zod`, R4 do Profissional, escopo de
 * escrita e a trilha gravada na MESMA transação da gravação (ADR-075).
 */

const PATIENT_ROLES = CLINIC_STAFF_ROLES.filter((role) =>
  canRoleAccess('/api/patients', role),
);
const GUARDIAN_ROLES = CLINIC_STAFF_ROLES.filter((role) =>
  canRoleAccess('/api/guardians', role),
);

const idSchema = z.string().min(1).max(100);

export const saveAnamnesis = defineAction({
  access: { kind: 'staff', roles: PATIENT_ROLES },
  input: z.object({ patientId: idSchema, body: anamnesisSchema }),
  authorize: (context) =>
    authorizePatientAccess(context, context.input.patientId),
  handler: async ({ input, tx }) =>
    toAnamnesisDto(
      await new UpsertAnamnesis(tx.anamneses, tx.patients).execute({
        patientId: input.patientId,
        ...input.body,
      }),
    ),
  audit: ({ input }) => ({
    action: 'update',
    resourceType: 'anamnesis',
    resourceId: input.patientId,
    patientId: input.patientId,
  }),
});

/** Vincula (ou desvincula, com `null`) o responsável do paciente. */
export const linkPatientGuardian = defineAction({
  access: { kind: 'staff', roles: PATIENT_ROLES },
  input: z.object({
    patientId: idSchema,
    guardianId: z.string().max(100).nullable(),
  }),
  authorize: async (context) => {
    assertCanManageGuardians(context.session);
    await authorizePatientAccess(context, context.input.patientId);
  },
  handler: async ({ input, tx }) => {
    const patient = await new UpdatePatient(
      tx.patients,
      tx.partners,
      tx.guardians,
    ).execute({ id: input.patientId, guardianId: input.guardianId });
    const guardian = patient.guardianId
      ? await tx.guardians.findById(patient.guardianId)
      : null;
    return toPatientDto(patient, guardian);
  },
  audit: ({ input }) => ({
    action: 'update',
    resourceType: 'patient',
    resourceId: input.patientId,
    patientId: input.patientId,
    detail: input.guardianId
      ? `responsável vinculado: ${input.guardianId}`
      : 'responsável desvinculado',
  }),
});

export const createGuardian = defineAction({
  access: { kind: 'staff', roles: GUARDIAN_ROLES },
  input: guardianSchema,
  authorize: async ({ session }) => assertCanManageGuardians(session),
  handler: async ({ input, tx }) =>
    toGuardianDto(await new CreateGuardian(tx.guardians).execute(input)),
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'guardian',
    resourceId: result.id,
  }),
});

export const updateGuardian = defineAction({
  access: { kind: 'staff', roles: GUARDIAN_ROLES },
  input: z.object({ id: idSchema, body: guardianSchema.partial() }),
  authorize: async ({ session }) => assertCanManageGuardians(session),
  handler: async ({ input, tx }) =>
    toGuardianDto(
      await new UpdateGuardian(tx.guardians).execute({
        id: input.id,
        ...input.body,
      }),
    ),
  // Só os nomes dos campos: a trilha nunca leva o contato (ADR-014).
  audit: ({ input }) => ({
    action: 'update',
    resourceType: 'guardian',
    resourceId: input.id,
    detail: `campos: ${Object.keys(input.body).join(', ') || '—'}`,
  }),
});

export const deleteGuardian = defineAction({
  access: { kind: 'staff', roles: GUARDIAN_ROLES },
  input: z.object({ id: idSchema }),
  authorize: async ({ session }) => assertCanManageGuardians(session),
  handler: async ({ input, tx }) => {
    await new DeleteGuardian(
      tx.guardians,
      tx.patients,
      tx.userAccounts,
    ).execute(input.id);
    return { id: input.id };
  },
  audit: ({ input }) => ({
    action: 'delete',
    resourceType: 'guardian',
    resourceId: input.id,
  }),
});
