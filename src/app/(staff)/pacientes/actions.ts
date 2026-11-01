'use server';

import { CreatePatient } from '@/application/patients/create-patient';
import { assertCanManageGuardians } from '@/lib/auth/guardian-access';
import { CLINIC_STAFF_ROLES } from '@/lib/auth/staff-roles';
import { toPatientDto } from '@/lib/dto';
import { createPatientSchema } from '@/lib/patient-input';
import { defineAction } from '@/lib/server/define-action';
import { canRoleAccess } from '@/lib/staff-pages';

/**
 * Ações de `/pacientes` (#549, ADR-069 § 2, ADR-075): Server Action com guarda
 * de sessão e papel, `zod`, escopo de escrita e auditoria na mesma transação
 * da gravação. A lista se atualiza por `refresh()` dentro do `defineAction`.
 */

/** Mesma matriz de papéis da rota `/api/patients` (e da tela). */
const PATIENT_ROLES = CLINIC_STAFF_ROLES.filter((role) =>
  canRoleAccess('/api/patients', role),
);

/**
 * Cadastro de paciente. O Profissional que cadastra ganha o vínculo na mesma
 * transação (RBAC-17/18): paciente, vínculo e trilha gravam juntos ou nada grava.
 */
export const createPatient = defineAction({
  access: { kind: 'staff', roles: PATIENT_ROLES },
  input: createPatientSchema,
  authorize: async ({ input, session }) => {
    if (input.guardianId) assertCanManageGuardians(session);
  },
  handler: async ({ input, session, tx }) => {
    const patient = await new CreatePatient(
      tx.patients,
      tx.partners,
      tx.guardians,
    ).execute({
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      cpf: input.cpf ?? null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      notes: input.notes ?? null,
      referredByPartnerId: input.referredByPartnerId ?? null,
      guardianId: input.guardianId ?? null,
    });
    if (session.role === 'profissional' && session.professionalId) {
      await tx.professionalPatientLinks.ensureLink(
        session.professionalId,
        patient.id,
      );
    }
    return toPatientDto(patient);
  },
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'patient',
    resourceId: result.id,
    patientId: result.id,
  }),
});
