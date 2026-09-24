'use client';

import { Button, Card } from '@still-void/ui/react';
import { EmptyState } from '@/components/feedback';
import {
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import type { AppointmentDto, ScheduleClosureDto } from '@/lib/dto';
import { APPOINTMENT_STATUS_LABELS, formatTime } from '@/lib/format';
import {
  buildMonthDays,
  dayKey,
  isInvalidDay,
  WEEKDAY_LABELS,
} from './calendar-days';
import { MobileMonth } from './mobile-month';

export { dayKey } from './calendar-days';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-info-soft text-info border-info',
  confirmed: 'bg-accent-soft text-accent-ink border-accent',
  completed: 'bg-success-soft text-success border-success',
  cancelled: 'bg-surface-2 text-ink-3 border-border line-through',
  no_show: 'bg-warning-soft text-warning border-warning',
};

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
    </div>
  );
}

interface CalendarGridProps {
  monthDate: Date;
  appointments: AppointmentDto[];
  scheduleConfig?: ScheduleConfig;
  /** Feriados/recessos (dia fechado) e ausências de profissional (aviso). */
  closures?: ScheduleClosureDto[];
  professionalName?: (professionalId: string) => string;
  /** Celular: mês compacto + lista do dia (`MobileMonth`) no lugar da grade de chips. */
  compact?: boolean;
  onDayClick: (day: Date) => void;
  onAppointmentClick: (appointment: AppointmentDto) => void;
}

export function CalendarGrid({
  monthDate,
  appointments,
  scheduleConfig = DEFAULT_SCHEDULE_CONFIG,
  closures = [],
  professionalName = () => 'Profissional',
  compact = false,
  onDayClick,
  onAppointmentClick,
}: CalendarGridProps) {
  const days = buildMonthDays(monthDate);
  const todayKey = dayKey(new Date());

  const byDay = new Map<string, AppointmentDto[]>();
  for (const appointment of appointments) {
    const key = dayKey(new Date(appointment.startsAt));
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
                const visibleAppointments = dayAppointments.slice(
                  0,
                  MAX_VISIBLE_PER_DAY,
                );
                const hiddenCount =
                  dayAppointments.length - visibleAppointments.length;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: célula contém <Button> filhos (compromissos); trocar por <button> geraria <button> aninhado, HTML inválido.
                  <div
                    key={key}
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
                        key === todayKey ? 'bg-accent-ink text-white' : ''
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
                          title={`${formatTime(appointment.startsAt)} ${appointment.patientName ?? ''} — ${appointment.procedure}`}
                          variant="outline"
                          className={`h-auto w-full truncate rounded border-0 px-1.5 py-0.5 text-left font-normal text-xs ${
                            STATUS_COLORS[appointment.status] ?? 'bg-surface-2'
                          }`}
                        >
                          {formatTime(appointment.startsAt)}{' '}
                          {appointment.patientName}
                        </Button>
                      ))}
                      {hiddenCount > 0 && (
                        <span className="px-1.5 font-medium text-ink-3 text-xs">
                          +{hiddenCount} mais
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
