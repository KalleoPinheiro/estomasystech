import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  ACTIONS_REMOVING_EVENT,
  ChangeAppointmentStatus,
} from '@/application/appointments/change-appointment-status';
import { CompleteAppointment } from '@/application/appointments/complete-appointment';
import { RescheduleAppointment } from '@/application/appointments/reschedule-appointment';
import { DispenseProcedureKit } from '@/application/inventory/dispense-procedure-kit';
import { RegisterStockMovement } from '@/application/inventory/register-stock-movement';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { scheduleCalendarSync } from '@/lib/calendar-sync';
import { toAppointmentDto } from '@/lib/dto';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['confirm', 'cancel', 'no_show']) }),
  z.object({
    action: z.literal('complete'),
    followUpInDays: z.number().int().positive().max(365).nullish(),
  }),
  z.object({
    action: z.literal('reschedule'),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  }),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { appointments, patients } = await getRepositories(
      sessionScope(guard.session),
    );
    const appointment = await appointments.findById(id);
    if (!appointment) {
      return null;
    }
    const patient = await patients.findById(appointment.patientId);
    return toAppointmentDto(appointment, patient?.fullName);
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = actionSchema.parse(await request.json());
    const services = await getRepositories(writeScope(guard.session));
    const { appointments } = services;

    if (body.action === 'complete') {
      // Unidade de trabalho (CONS2-01): consulta, fatura e consumo de pacote
      // persistem juntos ou nada persiste. O kit permanece fora — best-effort
      // por contrato (PRD O2.4, "nunca bloqueia a conclusão").
      const completed = await services.transactions.run((tx) =>
        new CompleteAppointment(
          tx.appointments,
          tx.invoices,
          tx.followUps,
          tx.sessionPackages,
        ).execute({
          id,
          followUpInDays: body.followUpInDays ?? null,
        }),
      );
      // Kit do procedimento: baixa automática, nunca bloqueia a conclusão.
      let kitWarnings: string[] = [];
      if (completed.procedureId) {
        const dispense = new DispenseProcedureKit(
          services.procedureKits,
          services.supplies,
          services.stockMovements,
          new RegisterStockMovement(
            services.supplies,
            services.stockMovements,
            services.appointments,
            services.supplyBatches,
          ),
        );
        const result = await dispense.execute({
          appointmentId: completed.id,
          procedureId: completed.procedureId,
        });
        kitWarnings = result.warnings;
      }
      return { ...toAppointmentDto(completed), kitWarnings };
    }
    if (body.action === 'reschedule') {
      const rescheduled = await new RescheduleAppointment(
        appointments,
        services.scheduleConfig,
      ).execute({
        id,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
      });
      scheduleCalendarSync(services, (sync) =>
        sync.rescheduled(rescheduled.id),
      );
      return toAppointmentDto(rescheduled);
    }
    const changed = await new ChangeAppointmentStatus(appointments).execute({
      id,
      action: body.action,
    });
    const eventId = changed.googleEventId;
    if (eventId && ACTIONS_REMOVING_EVENT.includes(body.action)) {
      scheduleCalendarSync(services, (sync) => sync.removed(eventId));
    }
    return toAppointmentDto(changed);
  });
}
