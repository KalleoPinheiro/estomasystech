'use server';

import { z } from 'zod';
import { SetFollowUpStatus } from '@/application/followups/set-follow-up-status';
import { keepGuardianAfterMajority } from '@/application/guardians/majority-review';
import type { UserRole } from '@/domain/auth/user-role';
import { FollowUp } from '@/domain/followup/follow-up';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { GUARDIAN_MANAGER_ROLES } from '@/lib/auth/guardian-access';
import { assertPatientLinkedForProfessionalWrite } from '@/lib/auth/professional-patient-scope';
import { defineAction } from '@/lib/server/define-action';

/**
 * Ações da tela Hoje (#548, ADR-069 § 2, ADR-075): cada uma é uma Server Action
 * com guarda de sessão e papel, `zod`, escopo de escrita e auditoria na mesma
 * transação da gravação. A tela se atualiza por `refresh()` dentro do
 * `defineAction`.
 */

const idSchema = z.object({ id: z.string().min(1).max(100) });

/** Concluir ou cancelar um retorno pendente. R4: o Profissional só age nos pacientes vinculados. */
export const resolveFollowUp = defineAction({
  access: { kind: 'staff' },
  input: idSchema.extend({ status: z.enum(['done', 'cancelled']) }),
  authorize: async ({ input, session, scope }) => {
    const { followUps, professionalPatientLinks } =
      await getRepositories(scope);
    const followUp = await followUps.findById(input.id);
    if (!followUp) {
      throw new NotFoundError('Retorno', input.id);
    }
    await assertPatientLinkedForProfessionalWrite(
      session,
      followUp.patientId,
      professionalPatientLinks,
    );
  },
  handler: async ({ input, tx }) => {
    const updated = await new SetFollowUpStatus(tx.followUps).execute(input);
    return {
      id: updated.id,
      patientId: updated.patientId,
      status: updated.status,
    };
  },
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'follow_up',
    resourceId: result.id,
    patientId: result.patientId,
    detail: `retorno: ${result.status}`,
  }),
});

/**
 * Triagem da foto enviada pelo paciente (O4.2): «reviewed» mantém o plano;
 * «escalated» antecipa o retorno criando um follow-up com vencimento imediato.
 */
export const decideTriage = defineAction({
  access: { kind: 'staff' },
  input: idSchema.extend({ decision: z.enum(['reviewed', 'escalated']) }),
  authorize: async ({ input, session, scope }) => {
    await assertClinicalResourceAccessible(
      session,
      'photo',
      input.id,
      await getRepositories(scope),
    );
  },
  handler: async ({ input, tx }) => {
    const photo = await tx.conditionPhotos.findById(input.id);
    if (!photo) {
      throw new NotFoundError('Foto', input.id);
    }
    const condition = await tx.conditions.findById(photo.conditionId);
    const triaged = photo.withTriage(input.decision);
    await tx.conditionPhotos.save(triaged);
    if (input.decision === 'escalated' && condition) {
      await tx.followUps.save(
        FollowUp.create({
          patientId: condition.patientId,
          appointmentId: null,
          dueDate: new Date(),
          reason: `Retorno antecipado: foto de ${condition.title} sinaliza atenção`,
        }),
      );
    }
    return {
      id: input.id,
      decision: input.decision,
      patientId: condition?.patientId ?? null,
    };
  },
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'photo',
    resourceId: result.id,
    patientId: result.patientId,
    detail: `triagem: ${result.decision}`,
  }),
});

const GUARDIAN_MANAGERS = GUARDIAN_MANAGER_ROLES as readonly UserRole[];

/** A clínica mantém o acesso com o responsável depois dos 18 anos (#372, ADR-032). */
export const keepMajorityGuardian = defineAction({
  access: { kind: 'staff', roles: GUARDIAN_MANAGERS },
  input: z.object({ patientId: z.string().min(1).max(100) }),
  handler: async ({ input, tx }) => {
    const patient = await keepGuardianAfterMajority(
      tx,
      input.patientId,
      async () => undefined,
    );
    return { patientId: patient.id };
  },
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'patient',
    resourceId: result.patientId,
    patientId: result.patientId,
    detail: 'maioridade: acesso ao portal mantido com o responsável',
  }),
});
