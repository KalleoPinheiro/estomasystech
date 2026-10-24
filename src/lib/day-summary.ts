import type { AppointmentDto } from '@/lib/dto';

/** Consulta que ainda pode acontecer hoje: sai da conta ao concluir, cancelar ou faltar. */
const OPEN_STATUSES = ['scheduled', 'confirmed'];

/**
 * Próximo atendimento do dia (#428, tela "Hoje"): o que está em andamento ou
 * começa mais cedo entre as consultas ainda abertas. `null` quando não há.
 */
export function nextAppointment(
  today: readonly AppointmentDto[],
  now: Date,
): AppointmentDto | null {
  const open = today
    .filter(
      (a) =>
        OPEN_STATUSES.includes(a.status) &&
        new Date(a.endsAt).getTime() > now.getTime(),
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  return open[0] ?? null;
}

export interface DayCounts {
  /** Consultas do dia que não foram canceladas. */
  total: number;
  completed: number;
}

export function dayCounts(today: readonly AppointmentDto[]): DayCounts {
  const kept = today.filter((a) => a.status !== 'cancelled');
  return {
    total: kept.length,
    completed: kept.filter((a) => a.status === 'completed').length,
  };
}

/**
 * Consultas que já terminaram e seguem sem desfecho (agendada ou confirmada):
 * a equipe precisa concluir, registrar falta ou cancelar (#480). Mais antigas
 * primeiro.
 */
export function pendingClosure(
  appointments: readonly AppointmentDto[],
  now: Date,
): AppointmentDto[] {
  return appointments
    .filter((a) => isPendingClosure(a, now))
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
}

export function isPendingClosure(
  appointment: Pick<AppointmentDto, 'status' | 'endsAt'>,
  now: Date,
): boolean {
  return (
    OPEN_STATUSES.includes(appointment.status) &&
    new Date(appointment.endsAt).getTime() < now.getTime()
  );
}
