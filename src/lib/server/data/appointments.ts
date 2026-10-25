import 'server-only';
import { ListAppointments } from '@/application/appointments/list-appointments';
import type { AppointmentStatus } from '@/domain/scheduling/appointment';
import { getRepositories } from '@/infrastructure/container';
import { professionalScopeFor } from '@/lib/auth/appointment-query';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type AppointmentDto, toAppointmentDto } from '@/lib/dto';

export interface AppointmentRange {
  from: Date;
  to: Date;
  /** Filtro pedido na query; o Profissional o ignora (R4/RBAC-19). */
  professionalId?: string;
  statuses?: readonly AppointmentStatus[];
}

/**
 * Consultas do período da empresa da sessão, já no escopo do papel: o
 * Profissional vê só a própria agenda e, sem vínculo de conta, nada. É a mesma
 * resposta de `GET /api/appointments`, que reaproveita esta função, e serve a
 * tela Hoje (consultas do dia e consultas sem desfecho).
 */
export async function listAppointmentsFor(
  session: Session,
  range: AppointmentRange,
): Promise<AppointmentDto[]> {
  const professional = professionalScopeFor(session, range.professionalId);
  if (professional.none) {
    return [];
  }
  const { appointments, patients } = await getRepositories(
    sessionScope(session),
  );
  const result = await new ListAppointments(appointments, patients).execute({
    from: range.from,
    to: range.to,
    professionalId: professional.professionalId,
    statuses: range.statuses,
  });
  return result.map(({ appointment, patientName, patientBirthDate }) =>
    toAppointmentDto(appointment, patientName, patientBirthDate),
  );
}
