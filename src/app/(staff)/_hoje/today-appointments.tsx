import Link from 'next/link';
import { StatusBadge } from '@/components/status-badge';
import { SummaryCard } from '@/components/summary-card';
import { startOfZonedDayAfter } from '@/domain/shared/time-zone';
import type { Session } from '@/lib/auth/session';
import { dayCounts, nextAppointment } from '@/lib/day-summary';
import type { AppointmentDto } from '@/lib/dto';
import { APPOINTMENT_STATUS_LABELS, formatTime } from '@/lib/format';
import { homonymPatientIds, listPatientName } from '@/lib/patient-name';
import { listAppointmentsFor } from '@/lib/server/data/appointments';
import { loadBlock } from '@/lib/server/data/load-block';

/** Próximo atendimento e números do dia, no topo da agenda de hoje (#428). */
function DayHighlights({ today }: { today: AppointmentDto[] }) {
  const next = nextAppointment(today, new Date());
  const counts = dayCounts(today);

  return (
    <div data-day-highlights className="mb-3 border-border border-b pb-3">
      {next && (
        <div data-next-appointment>
          <p className="text-ink-3 text-xs">Próximo atendimento</p>
          <p className="font-semibold">
            <Link
              href={`/pacientes/${next.patientId}`}
              className="hover:underline"
            >
              {`${next.patientName} · ${formatTime(next.startsAt)}`}
            </Link>
          </p>
          <p className="text-ink-2 text-sm">{`Procedimento: ${next.procedure}`}</p>
        </div>
      )}
      <p className="mt-2 text-ink-3 text-sm" data-day-counts>
        {`${counts.completed} de ${counts.total} concluídas`}
      </p>
    </div>
  );
}

/**
 * Consultas de hoje no escopo do papel: o Profissional vê só a própria agenda
 * (R4), a recepção e o Admin, a da clínica (a agenda do dia vem do servidor,
 * sem passar por `/api`).
 */
export async function TodayAppointmentsCard({ session }: { session: Session }) {
  const now = new Date();
  const { data: today, error } = await loadBlock(() =>
    listAppointmentsFor(session, {
      from: startOfZonedDayAfter(now, 0),
      to: startOfZonedDayAfter(now),
    }),
  );
  const homonyms = homonymPatientIds(today ?? []);

  return (
    <SummaryCard
      title="Consultas de hoje"
      href={{ label: 'Ver agenda completa', url: '/agenda' }}
      error={error}
      isEmpty={!today || today.length === 0}
      emptyMessage="Nenhuma consulta agendada para hoje."
      emptyIcon="check-circle"
    >
      <DayHighlights today={today ?? []} />
      <ul className="divide-y divide-border">
        {(today ?? []).map((appointment) => (
          <li key={appointment.id} className="flex items-center gap-4 py-3">
            <span className="w-24 shrink-0 font-mono text-ink-2 text-sm">
              {formatTime(appointment.startsAt)}–
              {formatTime(appointment.endsAt)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {listPatientName(appointment, homonyms)}
              </p>
              <p className="truncate text-ink-3 text-sm">
                {appointment.procedure}
              </p>
            </div>
            <StatusBadge
              status={appointment.status}
              label={
                APPOINTMENT_STATUS_LABELS[appointment.status] ??
                appointment.status
              }
            />
          </li>
        ))}
      </ul>
    </SummaryCard>
  );
}
