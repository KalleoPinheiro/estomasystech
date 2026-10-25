import { z } from 'zod';

/** Entrada de agendar uma consulta: a rota `POST /api/appointments` e a Server Action usam a mesma. */
export const scheduleSchema = z.object({
  patientId: z.string().min(1),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  procedure: z.string().min(1).max(500),
  priceCents: z.number().int().nonnegative().max(1_000_000_000),
  notes: z.string().max(5000).nullish(),
  professionalId: z.string().max(100).nullish(),
  procedureId: z.string().max(100).nullish(),
  /** Recall de 1 clique: follow-up de origem vira "scheduled" após criar. */
  followUpId: z.string().max(100).nullish(),
});

/** Série semanal: a mesma consulta repetida `occurrences` vezes. */
export const recurringSchema = scheduleSchema
  .omit({ followUpId: true })
  .extend({
    occurrences: z.number().int().min(2).max(24),
    weeksInterval: z.number().int().min(1).max(8).default(1),
  });

/** Campos de cada ação sobre uma consulta existente (`PATCH /api/appointments/:id`). */
export const cancelFields = {
  requestedBy: z.enum(['clinic', 'patient']).optional(),
  reason: z.string().max(1000).nullish(),
  chargeLateFee: z.boolean().optional(),
};
export const noShowFields = { chargeLateFee: z.boolean().optional() };
export const completeFields = {
  followUpInDays: z.number().int().positive().max(365).nullish(),
};
export const rescheduleFields = {
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
};

export const appointmentActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('cancel'), ...cancelFields }),
  z.object({ action: z.literal('no_show'), ...noShowFields }),
  z.object({ action: z.literal('complete'), ...completeFields }),
  z.object({ action: z.literal('reschedule'), ...rescheduleFields }),
]);
