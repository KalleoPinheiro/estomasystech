import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { parseStatusFilter } from '@/domain/scheduling/appointment-status-filter';
import { getRepositories, type Services } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { parseAppointmentRange } from '@/lib/auth/appointment-query';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { scheduleCalendarSync } from '@/lib/calendar-sync';
import { toAppointmentDto } from '@/lib/dto';
import { ensureLinkBestEffort } from '@/lib/patient-link';
import { listAppointmentsFor } from '@/lib/server/data/appointments';

const scheduleSchema = z.object({
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

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const range = parseAppointmentRange(request);
  if (!range) {
    return fail('Parâmetros obrigatórios: from, to (ISO 8601)', 400);
  }
  // Sem `status` a rota devolve tudo (contrato anterior); a agenda sempre o envia (AGE-FLT-03).
  const statusParam = request.nextUrl.searchParams.get('status');
  return handleRequest(() =>
    listAppointmentsFor(guard.session, {
      ...range,
      professionalId:
        request.nextUrl.searchParams.get('professionalId') ?? undefined,
      statuses:
        statusParam === null ? undefined : parseStatusFilter(statusParam),
    }),
  );
}

async function markFollowUpScheduled(
  services: Services,
  followUpId: string | null | undefined,
  patientId: string,
): Promise<void> {
  if (!followUpId) return;
  const followUp = await services.followUps.findById(followUpId);
  if (followUp?.status === 'pending' && followUp.patientId === patientId) {
    await services.followUps.save(followUp.markScheduled());
  }
}

/** Agendamento com profissional concede/renova o vínculo com o paciente, mesmo que quem tenha agendado seja outro papel (RBAC-19/20). */
async function linkProfessionalToPatient(
  services: Services,
  professionalId: string | null | undefined,
  patientId: string,
): Promise<void> {
  if (!professionalId) return;
  await ensureLinkBestEffort(
    services.professionalPatientLinks,
    professionalId,
    patientId,
  );
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = scheduleSchema.parse(await request.json());
    const services = await getRepositories(writeScope(guard.session));
    const appointment = await new ScheduleAppointment(
      services.appointments,
      services.patients,
      services.scheduleConfig,
      services.scheduleAvailability,
      services.professionals,
    ).execute({
      patientId: body.patientId,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      procedure: body.procedure,
      priceCents: body.priceCents,
      notes: body.notes ?? null,
      professionalId: body.professionalId ?? null,
      procedureId: body.procedureId ?? null,
    });
    await markFollowUpScheduled(
      services,
      body.followUpId,
      appointment.patientId,
    );
    await linkProfessionalToPatient(
      services,
      body.professionalId,
      appointment.patientId,
    );
    scheduleCalendarSync(services, (sync) => sync.created(appointment.id));
    return toAppointmentDto(appointment);
  });
}
