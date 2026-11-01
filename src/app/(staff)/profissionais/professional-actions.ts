'use server';

import { z } from 'zod';
import { SetProfessionalHours } from '@/application/scheduling/schedule-availability';
import { COMMISSION_TYPES } from '@/domain/professional/professional';
import { toProfessionalDto } from '@/lib/dto';
import { defineAction } from '@/lib/server/define-action';
import {
  createProfessionalRecord,
  updateProfessionalRecord,
} from '@/lib/server/professional-writes';
import { createdAudit, updatedAudit } from '@/lib/server/team-audit';
import { rolesWithAccessTo } from '@/lib/staff-pages';

/**
 * Ações da tela de Profissionais (#550): Server Actions com guarda de sessão e
 * papel, `zod`, escopo de escrita e auditoria na MESMA transação da gravação.
 * Comissão é dado financeiro: o papel é o da família administrativa
 * (`/api/professionals`), isto é, só o Admin de Empresa lê e grava — Atendente
 * e Profissional recebem a recusa de papel, sem tocar o repositório.
 */

const PROFESSIONAL_ROLES = rolesWithAccessTo('/api/professionals');

const professionalFields = {
  fullName: z.string().min(1).max(200),
  registry: z.string().max(100).nullish(),
  commissionType: z.enum(COMMISSION_TYPES).optional(),
  commissionPct: z.number().int().min(0).max(100).nullish(),
  commissionFixedCents: z.number().int().min(0).max(10_000_000).nullish(),
};

/** Cadastra um profissional. */
export const createProfessional = defineAction({
  access: { kind: 'staff', roles: PROFESSIONAL_ROLES },
  input: z.object(professionalFields),
  handler: async ({ input, tx }) =>
    toProfessionalDto(await createProfessionalRecord(tx.professionals, input)),
  audit: ({ result }) => createdAudit('professional', result.id),
});

/** Edita o cadastro, ou ativa e desativa o profissional. */
export const updateProfessional = defineAction({
  access: { kind: 'staff', roles: PROFESSIONAL_ROLES },
  input: z
    .object({
      id: z.string().min(1).max(100),
      ...professionalFields,
      active: z.boolean(),
    })
    .partial({ fullName: true, active: true }),
  handler: async ({ input: { id, ...change }, tx }) =>
    toProfessionalDto(
      await updateProfessionalRecord(tx.professionals, id, change),
    ),
  audit: ({ input, result }) =>
    updatedAudit('professional', result.id, input.active),
});

/** Substitui o horário semanal; lista vazia volta a seguir só a grade da clínica. */
export const saveAvailability = defineAction({
  access: { kind: 'staff', roles: PROFESSIONAL_ROLES },
  input: z.object({
    professionalId: z.string().min(1).max(100),
    windows: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          startMinute: z.number().int().min(0).max(1440),
          endMinute: z.number().int().min(0).max(1440),
        }),
      )
      .max(21),
  }),
  handler: async ({ input, tx }) => ({
    professionalId: input.professionalId,
    windows: await new SetProfessionalHours(
      tx.scheduleAvailability,
      tx.professionals,
    ).execute(input.professionalId, input.windows),
  }),
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'professional-availability',
    resourceId: result.professionalId,
  }),
});
