import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ListAppointments } from '@/application/appointments/list-appointments';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { parseStatusFilter } from '@/domain/scheduling/appointment-status-filter';
import { getRepositories, type Services } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { scheduleCalendarSync } from '@/lib/calendar-sync';
import { toAppointmentDto } from '@/lib/dto';
import { ensureLinkBestEffort } from '@/lib/patient-link';

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

  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  if (!from || !to) {
    return fail('Parâmetros obrigatórios: from, to (ISO 8601)', 400);
  }
  // Escopo dinâmico do Profissional (R4/RBAC-19): a sessão profissional só
  // pode ver a própria agenda — ignora professionalId vindo da query string.
  const professionalId =
    guard.session.role === 'profissional'
      ? (guard.session.professionalId ?? undefined)
      : (request.nextUrl.searchParams.get('professionalId') ?? undefined);
  // Sem `status` a rota devolve tudo (contrato anterior); a agenda sempre o envia (AGE-FLT-03).
  const statusParam = request.nextUrl.searchParams.get('status');
  return handleRequest(async () => {
    // Profissional sem vínculo de conta (dado legado/corrompido) nunca vê
    // agenda alheia por ausência de filtro — nunca cai no "sem filtro = tudo".
    if (
      guard.session.role === 'profissional' &&
      !guard.session.professionalId
    ) {
      return [];
    }
    const { appointments, patients } = await getRepositories(
      sessionScope(guard.session),
    );
    const result = await new ListAppointments(appointments, patients).execute({
      from: new Date(from),
      to: new Date(to),
      professionalId,
      statuses:
        statusParam === null ? undefined : parseStatusFilter(statusParam),
    });
    return result.map(({ appointment, patientName, patientBirthDate }) =>
      toAppointmentDto(appointment, patientName, patientBirthDate),
    );
  });
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
