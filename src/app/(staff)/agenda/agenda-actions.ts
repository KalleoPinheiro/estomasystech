'use server';

import { z } from 'zod';
import {
  CancelAppointmentByStaff,
  MarkNoShow,
} from '@/application/appointments/cancel-appointment-by-staff';
import {
  ACTIONS_REMOVING_EVENT,
  ChangeAppointmentStatus,
} from '@/application/appointments/change-appointment-status';
import { CompleteAppointment } from '@/application/appointments/complete-appointment';
import { RescheduleAppointment } from '@/application/appointments/reschedule-appointment';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { ScheduleRecurringAppointments } from '@/application/appointments/schedule-recurring-appointments';
import { DispenseProcedureKit } from '@/application/inventory/dispense-procedure-kit';
import { RegisterStockMovement } from '@/application/inventory/register-stock-movement';
import type { TransactionScope } from '@/application/ports/transaction-manager';
import { findWaitlistMatches } from '@/application/scheduling/waitlist';
import { localDateKey } from '@/domain/scheduling/schedule-availability';
import { cancellationPolicyOf } from '@/domain/scheduling/schedule-config';
import { getRepositories, type Services } from '@/infrastructure/container';
import type { ActionResult } from '@/lib/action-result';
import {
  cancelFields,
  completeFields,
  noShowFields,
  recurringSchema,
  rescheduleFields,
  scheduleSchema,
} from '@/lib/appointment-schemas';
import type { Session } from '@/lib/auth/session';
import { CLINIC_STAFF_ROLES } from '@/lib/auth/staff-roles';
import { writeScope } from '@/lib/auth/tenant-scope';
import { scheduleCalendarSync } from '@/lib/calendar-sync';
import { type AppointmentDto, toAppointmentDto } from '@/lib/dto';
import { logError } from '@/lib/log-error';
import { ensureLinkBestEffort } from '@/lib/patient-link';
import {
  assertProfessionalActsAsSelf,
  authorizeAppointmentAct,
} from '@/lib/server/appointment-authorization';
import { defineAction } from '@/lib/server/define-action';
import { readSession } from '@/lib/server/session';
import { canRoleAccess } from '@/lib/staff-pages';

/**
 * Gravações da agenda (#551, ADR-069 § 2, ADR-075, ADR-077). Cada ação é uma
 * Server Action: sessão e papel, `zod` (o mesmo das rotas `/api`), escopo de
 * escrita, a consulta e o que depende dela gravados juntos com a auditoria na
 * MESMA transação (falhou a trilha, nada fica gravado) e a tela atualizada por
 * `refresh()`. O que é best-effort por contrato (vínculo do profissional,
 * Google Agenda, baixa do kit, aviso da lista de espera) roda DEPOIS da
 * transação e nunca desfaz a gravação.
 */

/** Os papéis que a matriz de papéis deixa usar `/api/appointments`: os mesmos da tela. */
const AGENDA_ROLES = CLINIC_STAFF_ROLES.filter((role) =>
  canRoleAccess('/api/appointments', role),
);
const access = { kind: 'staff', roles: AGENDA_ROLES } as const;

const idSchema = z.object({ id: z.string().min(1).max(100) });

/** Efeito best-effort depois do commit: erro vira log, nunca desfaz nem falha a gravação. */
async function afterCommit(
  effect: (services: Services, session: Session) => Promise<void> | void,
): Promise<void> {
  try {
    const state = await readSession();
    if (state.status === 'anonymous') return;
    const services = await getRepositories(writeScope(state.session));
    await effect(services, state.session);
  } catch (error) {
    logError('Agenda: efeito pós-gravação falhou', error);
  }
}

const audited = (
  action: 'create' | 'update',
  detail: string,
  dto: AppointmentDto,
) => ({
  action,
  resourceType: 'appointment',
  resourceId: dto.id,
  patientId: dto.patientId,
  detail,
});

const scheduleCore = defineAction({
  access,
  input: scheduleSchema,
  authorize: async ({ input, session }) =>
    assertProfessionalActsAsSelf(session, input.professionalId),
  handler: async ({ input, tx }) => {
    const appointment = await new ScheduleAppointment(
      tx.appointments,
      tx.patients,
      tx.scheduleConfig,
      tx.scheduleAvailability,
      tx.professionals,
    ).execute({
      patientId: input.patientId,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      procedure: input.procedure,
      priceCents: input.priceCents,
      notes: input.notes ?? null,
      professionalId: input.professionalId ?? null,
      procedureId: input.procedureId ?? null,
    });
    // Recall de 1 clique: o retorno de origem vira «agendado» junto com a consulta.
    if (input.followUpId) {
      const followUp = await tx.followUps.findById(input.followUpId);
      if (
        followUp?.status === 'pending' &&
        followUp.patientId === appointment.patientId
      ) {
        await tx.followUps.save(followUp.markScheduled());
      }
    }
    return toAppointmentDto(appointment);
  },
  audit: ({ result }) => audited('create', 'consulta agendada', result),
});

/** Agenda uma consulta. Vínculo do profissional e Google Agenda depois do commit. */
export async function scheduleAppointment(
  input: z.input<typeof scheduleSchema>,
): Promise<ActionResult<AppointmentDto>> {
  const result = await scheduleCore(input);
  if (result.success) {
    const { id, patientId, professionalId } = result.data;
    await afterCommit(async (services) => {
      // Agendamento com profissional concede/renova o vínculo (RBAC-19/20).
      if (professionalId) {
        await ensureLinkBestEffort(
          services.professionalPatientLinks,
          professionalId,
          patientId,
        );
      }
      scheduleCalendarSync(services, (sync) => sync.created(id));
    });
  }
  return result;
}

interface SeriesResult {
  created: AppointmentDto[];
  skipped: Array<{ startsAt: string; reason: string }>;
}

const recurringCore = defineAction({
  access,
  input: recurringSchema,
  authorize: async ({ input, session }) =>
    assertProfessionalActsAsSelf(session, input.professionalId),
  handler: async ({ input, tx }): Promise<SeriesResult> => {
    const result = await new ScheduleRecurringAppointments(
      new ScheduleAppointment(
        tx.appointments,
        tx.patients,
        tx.scheduleConfig,
        tx.scheduleAvailability,
        tx.professionals,
      ),
    ).execute({
      patientId: input.patientId,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      procedure: input.procedure,
      priceCents: input.priceCents,
      notes: input.notes ?? null,
      professionalId: input.professionalId ?? null,
      procedureId: input.procedureId ?? null,
      occurrences: input.occurrences,
      weeksInterval: input.weeksInterval,
    });
    return {
      created: result.created.map((appointment) =>
        toAppointmentDto(appointment),
      ),
      skipped: result.skipped.map((skip) => ({
        startsAt: skip.startsAt.toISOString(),
        reason: skip.reason,
      })),
    };
  },
  audit: ({ input, result }) => ({
    action: 'create',
    // Paciente já validado pela série (#605): sem sessão criada, a trilha aponta para ele.
    resourceType: result.created[0] ? 'appointment' : 'patient',
    resourceId: result.created[0]?.id ?? input.patientId,
    patientId: input.patientId,
    detail: `série semanal: ${result.created.length} criada(s), ${result.skipped.length} pulada(s)`,
  }),
});

/** Agenda uma série semanal; a pulada por conflito não derruba a série (PRO-RN-08). */
export async function scheduleRecurring(
  input: z.input<typeof recurringSchema>,
): Promise<ActionResult<SeriesResult>> {
  const result = await recurringCore(input);
  if (result.success && result.data.created.length > 0) {
    const { created } = result.data;
    await afterCommit(async (services) => {
      if (input.professionalId) {
        await ensureLinkBestEffort(
          services.professionalPatientLinks,
          input.professionalId,
          input.patientId,
        );
      }
      for (const appointment of created) {
        scheduleCalendarSync(services, (sync) => sync.created(appointment.id));
      }
    });
  }
  return result;
}

const rescheduleCore = defineAction({
  access,
  input: idSchema.extend(rescheduleFields),
  authorize: ({ input, session, scope }) =>
    authorizeAppointmentAct(session, scope, input.id),
  handler: async ({ input, tx }) =>
    toAppointmentDto(
      await new RescheduleAppointment(
        tx.appointments,
        tx.scheduleConfig,
        tx.scheduleAvailability,
        tx.professionals,
      ).execute({
        id: input.id,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
      }),
    ),
  audit: ({ result }) => audited('update', 'consulta remarcada', result),
});

/** Remarca a consulta; o Google Agenda acompanha depois do commit. */
export async function rescheduleAppointment(
  input: z.input<typeof idSchema> & { startsAt: string; endsAt: string },
): Promise<ActionResult<AppointmentDto>> {
  const result = await rescheduleCore(input);
  if (result.success) {
    const { id } = result.data;
    await afterCommit((services) =>
      scheduleCalendarSync(services, (sync) => sync.rescheduled(id)),
    );
  }
  return result;
}

/** Confirma a consulta agendada. */
export const confirmAppointment = defineAction({
  access,
  input: idSchema,
  authorize: ({ input, session, scope }) =>
    authorizeAppointmentAct(session, scope, input.id),
  handler: async ({ input, tx }) =>
    toAppointmentDto(
      await new ChangeAppointmentStatus(tx.appointments).execute({
        id: input.id,
        action: 'confirm',
      }),
    ),
  audit: ({ result }) => audited('update', 'consulta confirmada', result),
});

interface Completion {
  appointment: AppointmentDto;
  procedureId: string | null;
}

const completeCore = defineAction({
  access,
  input: idSchema.extend(completeFields),
  authorize: ({ input, session, scope }) =>
    authorizeAppointmentAct(session, scope, input.id),
  // Consulta, fatura, consumo de pacote e retorno: juntos ou nada (CONS2-01).
  handler: async ({ input, tx }): Promise<Completion> => {
    const completed = await new CompleteAppointment(
      tx.appointments,
      tx.invoices,
      tx.followUps,
      tx.sessionPackages,
    ).execute({ id: input.id, followUpInDays: input.followUpInDays ?? null });
    return {
      appointment: toAppointmentDto(completed),
      procedureId: completed.procedureId,
    };
  },
  audit: ({ result }) =>
    audited('update', 'consulta concluída', result.appointment),
});

/** Conclui a consulta. A baixa do kit é best-effort: nunca bloqueia a conclusão (PRD O2.4). */
export async function completeAppointment(
  input: z.input<typeof idSchema> & { followUpInDays?: number | null },
): Promise<ActionResult<AppointmentDto & { kitWarnings: string[] }>> {
  const result = await completeCore(input);
  if (!result.success) return result;
  const { appointment, procedureId } = result.data;
  let kitWarnings: string[] = [];
  if (procedureId) {
    await afterCommit(async (services) => {
      const dispense = await new DispenseProcedureKit(
        services.procedureKits,
        services.supplies,
        services.stockMovements,
        new RegisterStockMovement(
          services.supplies,
          services.stockMovements,
          services.appointments,
          services.supplyBatches,
        ),
      ).execute({ appointmentId: appointment.id, procedureId });
      kitWarnings = dispense.warnings;
    });
  }
  return {
    success: true,
    data: { ...appointment, kitWarnings },
    error: null,
  };
}

interface Absence {
  appointment: AppointmentDto;
  feeInvoiceId: string | null;
  googleEventId: string | null;
}

/** Cancelamento e falta: consulta e taxa (quando cobrada) juntas ou nada. */
async function absenceHandler(
  kind: 'cancel' | 'no_show',
  input: { id: string; chargeLateFee?: boolean },
  tx: TransactionScope,
): Promise<Absence> {
  const policy = cancellationPolicyOf(await tx.scheduleConfig.get());
  const { appointment, feeInvoice } =
    kind === 'cancel'
      ? await new CancelAppointmentByStaff(
          tx.appointments,
          tx.invoices,
          policy,
        ).execute(input)
      : await new MarkNoShow(tx.appointments, tx.invoices, policy).execute(
          input,
        );
  return {
    appointment: toAppointmentDto(appointment),
    feeInvoiceId: feeInvoice?.id ?? null,
    googleEventId: appointment.googleEventId ?? null,
  };
}

const cancelCore = defineAction({
  access,
  input: idSchema.extend(cancelFields),
  authorize: ({ input, session, scope }) =>
    authorizeAppointmentAct(session, scope, input.id),
  handler: ({ input, tx }) => absenceHandler('cancel', input, tx),
  audit: ({ result }) =>
    audited('update', 'consulta cancelada', result.appointment),
});

const noShowCore = defineAction({
  access,
  input: idSchema.extend(noShowFields),
  authorize: ({ input, session, scope }) =>
    authorizeAppointmentAct(session, scope, input.id),
  handler: ({ input, tx }) => absenceHandler('no_show', input, tx),
  audit: ({ result }) =>
    audited('update', 'falta registrada', result.appointment),
});

interface AbsenceOutcome extends AppointmentDto {
  feeInvoiceId: string | null;
  waitlistMatches: number;
}

async function finishAbsence(
  kind: 'cancel' | 'no_show',
  result: ActionResult<Absence>,
): Promise<ActionResult<AbsenceOutcome>> {
  if (!result.success) return result;
  const { appointment, feeInvoiceId, googleEventId } = result.data;
  let waitlistMatches = 0;
  await afterCommit(async (services) => {
    if (googleEventId && ACTIONS_REMOVING_EVENT.includes(kind)) {
      scheduleCalendarSync(services, (sync) => sync.removed(googleEventId));
    }
    // Horário vago: quem da lista de espera aceita esse dia (a recepção oferece).
    if (kind === 'cancel') {
      waitlistMatches = (
        await findWaitlistMatches(
          services.waitlist,
          localDateKey(new Date(appointment.startsAt)),
          appointment.professionalId,
        )
      ).length;
    }
  });
  return {
    success: true,
    data: { ...appointment, feeInvoiceId, waitlistMatches },
    error: null,
  };
}

/** Cancela pela clínica (ou a pedido do paciente), com a taxa quando a política manda. */
export async function cancelAppointment(
  input: Parameters<typeof cancelCore>[0],
): Promise<ActionResult<AbsenceOutcome>> {
  return finishAbsence('cancel', await cancelCore(input));
}

/** Registra a falta, com a taxa quando a política manda. */
export async function markAppointmentNoShow(
  input: Parameters<typeof noShowCore>[0],
): Promise<ActionResult<AbsenceOutcome>> {
  return finishAbsence('no_show', await noShowCore(input));
}
