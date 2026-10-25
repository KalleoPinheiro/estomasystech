import { Card } from '@still-void/ui/react';
import Link from 'next/link';
import { startOfZonedDayAfter } from '@/domain/shared/time-zone';
import type { Session } from '@/lib/auth/session';
import { pendingClosure } from '@/lib/day-summary';
import { formatDate, formatTime } from '@/lib/format';
import { homonymPatientIds, listPatientName } from '@/lib/patient-name';
import { listAppointmentsFor } from '@/lib/server/data/appointments';
import { loadBlock } from '@/lib/server/data/load-block';

const PENDING_CLOSURE_CAP = 8;

/**
 * Consultas dos últimos 30 dias que seguem "Agendada"/"Confirmada" (#480).
 * Só aparece quando há pendência; erro ou carga não ocupam espaço na tela.
 */
export async function PendingClosureCard({ session }: { session: Session }) {
  const now = new Date();
  const { data } = await loadBlock(() =>
    listAppointmentsFor(session, {
      from: startOfZonedDayAfter(now, -30),
      to: now,
    }),
  );
  const pending = pendingClosure(data ?? [], now);
  if (pending.length === 0) return null;
  const homonyms = homonymPatientIds(pending);

  return (
    <Card data-pending-closure className="mb-6 border-warning p-5">
      <h2 className="font-semibold text-lg">
        {`Consultas sem desfecho (${pending.length})`}
      </h2>
      <p className="mb-3 text-ink-3 text-sm">
        Já passaram e seguem agendadas ou confirmadas: conclua, registre a falta
        ou cancele.
      </p>
      <ul className="divide-y divide-border">
        {pending.slice(0, PENDING_CLOSURE_CAP).map((appointment) => (
          <li key={appointment.id} className="flex items-center gap-4 py-2">
            <span className="w-32 shrink-0 font-mono text-ink-2 text-sm">
              {`${formatDate(appointment.startsAt)} ${formatTime(appointment.startsAt)}`}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {listPatientName(appointment, homonyms)}
            </span>
            <span className="hidden truncate text-ink-3 text-sm sm:block">
              {appointment.procedure}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/agenda"
        className="mt-3 inline-flex min-h-11 items-center font-medium text-accent-ink text-sm hover:underline"
      >
        Abrir a agenda para dar o desfecho
      </Link>
    </Card>
  );
}
