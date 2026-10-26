import { DEFAULT_SCHEDULE_CONFIG } from '@/domain/scheduling/schedule-config';
import type { Session } from '@/lib/auth/session';
import { cellStart } from '@/lib/clinic-calendar';
import {
  countAppointmentsFor,
  listAppointmentsFor,
} from '@/lib/server/data/appointments';
import { loadBlock } from '@/lib/server/data/load-block';
import { listProfessionalOptions } from '@/lib/server/data/professionals';
import {
  listClosuresFor,
  loadScheduleConfig,
} from '@/lib/server/data/schedule';
import { listWaitlistFor } from '@/lib/server/data/waitlist';
import {
  type AgendaEntry,
  type AgendaQuery,
  parseDayKey,
  resolveAgendaWindow,
} from './agenda-range';
import { AgendaScreen } from './agenda-screen';

/**
 * Tudo o que a carga da agenda precisa, lido no servidor em paralelo (#551,
 * ADR-069): consultas do período e do recorte, contagem por status, grade,
 * feriados e ausências, profissionais e fila de espera. Cada leitura trata o
 * próprio erro (`loadBlock`): a que falha vira alerta no seu lugar, sem derrubar
 * a tela. O Profissional recebe só a própria agenda e a fila dos pacientes
 * vinculados (R4), pelas mesmas funções das rotas de API.
 */
export async function AgendaData({
  session,
  query,
  entry,
}: {
  session: Session;
  query: AgendaQuery;
  entry: AgendaEntry;
}) {
  const anchor = parseDayKey(query.anchor) ?? new Date();
  const period = resolveAgendaWindow(query.view, anchor);
  const range = {
    from: cellStart(period.from),
    to: cellStart(period.to),
    professionalId: query.professionalId || undefined,
  };
  const [appointments, counts, professionals, schedule, closures, waitlist] =
    await Promise.all([
      loadBlock(() =>
        listAppointmentsFor(session, { ...range, statuses: query.statuses }),
      ),
      loadBlock(() => countAppointmentsFor(session, range)),
      loadBlock(() => listProfessionalOptions(session)),
      loadBlock(() => loadScheduleConfig(session)),
      loadBlock(() =>
        listClosuresFor(session, {
          from: period.closuresFrom,
          to: period.closuresTo,
        }),
      ),
      loadBlock(() => listWaitlistFor(session)),
    ]);

  return (
    <AgendaScreen
      query={query}
      entry={entry}
      appointments={appointments.data}
      appointmentsError={appointments.error}
      statusCounts={counts.data}
      countsError={counts.error}
      professionals={professionals.data ?? []}
      professionalsError={professionals.error}
      scheduleConfig={schedule.data?.config ?? DEFAULT_SCHEDULE_CONFIG}
      closures={closures.data ?? []}
      waitlist={waitlist.data}
      waitlistError={waitlist.error}
    />
  );
}
