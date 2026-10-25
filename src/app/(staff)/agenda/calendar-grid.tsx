'use client';

import { Button, Card } from '@still-void/ui/react';
import { useState } from 'react';
import { EmptyState } from '@/components/feedback';
import { Modal } from '@/components/modal';
import {
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { clinicDayCell, instantDayKey } from '@/lib/clinic-calendar';
import { isPendingClosure } from '@/lib/day-summary';
import type { AppointmentDto, ScheduleClosureDto } from '@/lib/dto';
import { APPOINTMENT_STATUS_LABELS, formatTime } from '@/lib/format';
import { homonymPatientIds, listPatientName } from '@/lib/patient-name';
import {
  buildMonthDays,
  dayKey,
  isInvalidDay,
  WEEKDAY_LABELS,
} from './calendar-days';
import { MobileMonth } from './mobile-month';
import {
  PENDING_CLOSURE_CLASS,
  PENDING_CLOSURE_LABEL,
  STATUS_COLORS,
} from './status-colors';

export { dayKey } from './calendar-days';

const MAX_VISIBLE_PER_DAY = 3;

function StatusLegend() {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-ink-3 text-xs">
      {Object.entries(STATUS_COLORS).map(([status, colorClass]) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full border ${colorClass}`} />
          {APPOINTMENT_STATUS_LABELS[status] ?? status}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`h-2.5 w-2.5 rounded-full border border-border ${PENDING_CLOSURE_CLASS}`}
        />
        {PENDING_CLOSURE_LABEL} (já passou)
      </span>
    </div>
  );
}

/** "2026-10-22" → "22/10/2026" para o título do diálogo do dia. */
const formatDayTitle = (key: string): string =>
  key.split('-').reverse().join('/');

interface CalendarGridProps {
  monthDate: Date;
  appointments: AppointmentDto[];
  scheduleConfig?: ScheduleConfig;
  /** Feriados/recessos (dia fechado) e ausências de profissional (aviso). */
  closures?: ScheduleClosureDto[];
  professionalName?: (professionalId: string) => string;
  /** Celular: mês compacto + lista do dia (`MobileMonth`) no lugar da grade de chips. */
  compact?: boolean;
  /** Filtro de status pede as canceladas: ocupam linha da célula como as demais (#538). */
  showCancelled?: boolean;
  onDayClick: (day: Date) => void;
  /** Celular: dia marcado no mês compacto (a visão Dia abre nele, #591). */
  onSelectDay?: (day: Date) => void;
  onAppointmentClick: (appointment: AppointmentDto) => void;
}

export function CalendarGrid({
  monthDate,
  appointments,
  scheduleConfig = DEFAULT_SCHEDULE_CONFIG,
  closures = [],
  professionalName = () => 'Profissional',
  compact = false,
  showCancelled = false,
  onDayClick,
  onSelectDay,
  onAppointmentClick,
}: CalendarGridProps) {
  const days = buildMonthDays(monthDate);
  const now = new Date();
  const todayKey = dayKey(clinicDayCell(now));
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const byDay = new Map<string, AppointmentDto[]>();
  const homonyms = homonymPatientIds(appointments);
  for (const appointment of appointments) {
    const key = instantDayKey(appointment.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), appointment]);
  }

  return (
    <div>
      {!compact && <StatusLegend />}
      {appointments.length === 0 && (
        <EmptyState message="Nenhuma consulta agendada neste mês." />
      )}
      {compact ? (
        <MobileMonth
          monthDate={monthDate}
          appointments={appointments}
          closures={closures}
          professionalName={professionalName}
          isBookable={(day) =>
            !isInvalidDay(day, scheduleConfig) &&
            !closures.some(
              (c) =>
                c.professionalId === null &&
                c.startsOn <= dayKey(day) &&
                dayKey(day) <= c.endsOn,
            )
          }
          onBook={onDayClick}
          onSelectDay={onSelectDay}
          onAppointmentClick={onAppointmentClick}
        />
      ) : (
        <div className="overflow-x-auto">
          <Card className="min-w-[840px] overflow-hidden">
            <div className="grid grid-cols-7 border-border border-b bg-bg">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="px-2 py-2 text-center font-semibold text-ink-3 text-xs uppercase"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = dayKey(day);
                const isCurrentMonth = day.getMonth() === monthDate.getMonth();
                const dayClosures = closures.filter(
                  (c) => c.startsOn <= key && key <= c.endsOn,
                );
                const clinicClosure = dayClosures.find(
                  (c) => c.professionalId === null,
                );
                const invalid =
                  isInvalidDay(day, scheduleConfig) || Boolean(clinicClosure);
                const dayAppointments = (byDay.get(key) ?? []).sort((a, b) =>
                  a.startsAt.localeCompare(b.startsAt),
                );
                // Cancelada não ocupa linha da célula: vai para "+N mais" (#471),
                // salvo quando o filtro de status a pede (#538).
                const visibleAppointments = dayAppointments
                  .filter(
                    (appointment) =>
                      showCancelled || appointment.status !== 'cancelled',
                  )
                  .slice(0, MAX_VISIBLE_PER_DAY);
                const hiddenCount =
                  dayAppointments.length - visibleAppointments.length;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: célula contém <Button> filhos (compromissos); trocar por <button> geraria <button> aninhado, HTML inválido.
                  <div
                    key={key}
                    data-calendar-day={key}
                    role="button"
                    tabIndex={invalid ? -1 : 0}
                    onClick={() => !invalid && onDayClick(day)}
                    onKeyDown={(event) => {
                      if (invalid) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onDayClick(day);
                      }
                    }}
                    aria-disabled={invalid || undefined}
                    className={`min-h-24 border-border border-r border-b p-1.5 align-top transition ${
                      invalid
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer hover:bg-accent-soft/50'
                    } ${isCurrentMonth ? '' : 'bg-bg/70 text-ink-3'}`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-medium text-xs ${
                        key === todayKey ? 'bg-accent-ink text-bg' : ''
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {dayClosures.map((closure) => (
                      <p
                        key={closure.id}
                        className="truncate px-1 text-ink-3 text-xs"
                        title={closure.reason}
                      >
                        {closure.professionalId === null
                          ? `Fechado: ${closure.reason}`
                          : `${professionalName(closure.professionalId)} ausente`}
                      </p>
                    ))}
                    <div className="mt-1 flex max-h-32 flex-col gap-1 overflow-hidden">
                      {visibleAppointments.map((appointment) => (
                        <Button
                          key={appointment.id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onAppointmentClick(appointment);
                          }}
                          title={`${formatTime(appointment.startsAt)} ${appointment.patientName ?? ''} — ${appointment.procedure}${isPendingClosure(appointment, now) ? ` (${PENDING_CLOSURE_LABEL})` : ''}`}
                          variant="outline"
                          className={`h-auto w-full truncate rounded border-0 px-1.5 py-0.5 text-left font-normal text-xs ${
                            STATUS_COLORS[appointment.status] ?? 'bg-surface-2'
                          } ${isPendingClosure(appointment, now) ? PENDING_CLOSURE_CLASS : ''}`}
                        >
                          {formatTime(appointment.startsAt)}{' '}
                          {listPatientName(appointment, homonyms)}
                        </Button>
                      ))}
                      {hiddenCount > 0 && (
                        <Button
                          type="button"
                          variant="link"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedDay(key);
                          }}
                          aria-label={`Ver todas as consultas de ${day.toLocaleDateString('pt-BR')}`}
                          className="h-auto justify-start px-1.5 py-0 font-medium text-ink-3 text-xs"
                        >
                          +{hiddenCount} mais
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
      {expandedDay && (
        <Modal
          title={`Consultas de ${formatDayTitle(expandedDay)}`}
          onClose={() => setExpandedDay(null)}
        >
          <ul className="flex flex-col gap-1.5">
            {(byDay.get(expandedDay) ?? []).map((appointment) => (
              <li key={appointment.id}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setExpandedDay(null);
                    onAppointmentClick(appointment);
                  }}
                  className={`h-auto w-full justify-start rounded px-2 py-1.5 text-left font-normal text-sm ${
                    STATUS_COLORS[appointment.status] ?? 'bg-surface-2'
                  }`}
                >
                  {formatTime(appointment.startsAt)}–
                  {formatTime(appointment.endsAt)}{' '}
                  {listPatientName(appointment, homonyms)} —{' '}
                  {appointment.procedure} ·{' '}
                  {APPOINTMENT_STATUS_LABELS[appointment.status] ??
                    appointment.status}
                </Button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
