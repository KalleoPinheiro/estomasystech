import type { NextRequest } from 'next/server';
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
import { DispenseProcedureKit } from '@/application/inventory/dispense-procedure-kit';
import { RegisterStockMovement } from '@/application/inventory/register-stock-movement';
import { findWaitlistMatches } from '@/application/scheduling/waitlist';
import { localDateKey } from '@/domain/scheduling/schedule-availability';
import { cancellationPolicyOf } from '@/domain/scheduling/schedule-config';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { appointmentActionSchema } from '@/lib/appointment-schemas';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { scheduleCalendarSync } from '@/lib/calendar-sync';
import { toAppointmentDto } from '@/lib/dto';
import { authorizeAppointmentAct } from '@/lib/server/appointment-authorization';

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
    const body = appointmentActionSchema.parse(await request.json());
    await authorizeAppointmentAct(guard.session, writeScope(guard.session), id);
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
        services.scheduleAvailability,
        services.professionals,
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
    if (body.action === 'confirm') {
      const confirmed = await new ChangeAppointmentStatus(appointments).execute(
        { id, action: 'confirm' },
      );
      return toAppointmentDto(confirmed);
    }

    // Cancelamento e falta: consulta e taxa (quando cobrada) juntas ou nada.
    const policy = cancellationPolicyOf(await services.scheduleConfig.get());
    const { appointment: changed, feeInvoice } =
      await services.transactions.run((tx) =>
        body.action === 'cancel'
          ? new CancelAppointmentByStaff(
              tx.appointments,
              tx.invoices,
              policy,
            ).execute({
              id,
              requestedBy: body.requestedBy,
              reason: body.reason,
              chargeLateFee: body.chargeLateFee,
            })
          : new MarkNoShow(tx.appointments, tx.invoices, policy).execute({
              id,
              chargeLateFee: body.chargeLateFee,
            }),
      );
    const eventId = changed.googleEventId;
    if (eventId && ACTIONS_REMOVING_EVENT.includes(body.action)) {
      scheduleCalendarSync(services, (sync) => sync.removed(eventId));
    }
    // Horário vago: quem da lista de espera aceita esse dia (a recepção oferece).
    const waitlistMatches =
      body.action === 'cancel'
        ? (
            await findWaitlistMatches(
              services.waitlist,
              localDateKey(changed.slot.start),
              changed.professionalId,
            )
          ).length
        : 0;
    return {
      ...toAppointmentDto(changed),
      feeInvoiceId: feeInvoice?.id ?? null,
      waitlistMatches,
    };
  });
}
