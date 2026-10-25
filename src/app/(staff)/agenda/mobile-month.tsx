'use client';

import { Button, Card } from '@still-void/ui/react';
import { useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { clinicDayCell, instantDayKey } from '@/lib/clinic-calendar';
import type { AppointmentDto, ScheduleClosureDto } from '@/lib/dto';
import { APPOINTMENT_STATUS_LABELS, formatTime } from '@/lib/format';
import { homonymPatientIds, listPatientName } from '@/lib/patient-name';
import { buildMonthDays, dayKey, WEEKDAY_LABELS } from './calendar-days';

interface MobileMonthProps {
  monthDate: Date;
  appointments: AppointmentDto[];
  closures: ScheduleClosureDto[];
  professionalName: (professionalId: string) => string;
  /** Mesmo critério da grade do desktop: dia passado, fora da grade ou fechado. */
  isBookable: (day: Date) => boolean;
  onBook: (day: Date) => void;
  /** Avisa a página do dia marcado, para a visão Dia abrir nele (#591). */
  onSelectDay?: (day: Date) => void;
  onAppointmentClick: (appointment: AppointmentDto) => void;
}

/** Hoje, se estiver no mês exibido; senão o dia 1 do mês. */
function initialDay(monthDate: Date): string {
  const today = clinicDayCell();
  return today.getMonth() === monthDate.getMonth() &&
    today.getFullYear() === monthDate.getFullYear()
    ? dayKey(today)
    : dayKey(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
}

/**
 * Agenda no celular: mês compacto de 7 colunas (só o número do dia e um ponto
 * quando há consulta) e, abaixo, a lista das consultas do dia escolhido. O
 * desktop segue com a grade de chips (`CalendarGrid`).
 */
export function MobileMonth({
  monthDate,
  appointments,
  closures,
  professionalName,
  isBookable,
  onBook,
  onSelectDay,
  onAppointmentClick,
}: MobileMonthProps) {
  const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
  const [selection, setSelection] = useState({
    monthKey,
    day: initialDay(monthDate),
  });
  const selectedKey =
    selection.monthKey === monthKey ? selection.day : initialDay(monthDate);
  const todayKey = dayKey(clinicDayCell());

  const byDay = new Map<string, AppointmentDto[]>();
  const homonyms = homonymPatientIds(appointments);
  for (const appointment of appointments) {
    const key = instantDayKey(appointment.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), appointment]);
  }

  const days = buildMonthDays(monthDate);
  const selectedDay =
    days.find((day) => dayKey(day) === selectedKey) ?? days[0];
  const dayAppointments = (byDay.get(selectedKey) ?? []).sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  const dayClosures = closures.filter(
    (c) => c.startsOn <= selectedKey && selectedKey <= c.endsOn,
  );

  return (
    <div data-mobile-month className="flex flex-col gap-4">
      <Card className="p-2">
        <div className="grid grid-cols-7" aria-hidden>
          {WEEKDAY_LABELS.map((label) => (
            <span
              key={label}
              className="py-1 text-center font-semibold text-ink-3 text-xs uppercase"
            >
              {label.slice(0, 1)}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = dayKey(day);
            const inMonth = day.getMonth() === monthDate.getMonth();
            const hasAppointments = (byDay.get(key)?.length ?? 0) > 0;
            const isSelected = key === selectedKey;
            return (
              <Button
                key={key}
                type="button"
                variant="ghost"
                aria-pressed={isSelected}
                aria-label={`${day.getDate()}${hasAppointments ? ', com consultas' : ''}`}
                data-day={key}
                data-has-appointments={hasAppointments || undefined}
                onClick={() => {
                  setSelection({ monthKey, day: key });
                  onSelectDay?.(day);
                }}
                className={`relative h-auto min-h-11 w-full min-w-0 flex-col gap-0.5 p-0 font-medium text-sm ${
                  inMonth ? '' : 'text-ink-3'
                } ${isSelected ? 'bg-accent-soft text-accent-ink' : ''}`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                    key === todayKey ? 'bg-accent-ink text-bg' : ''
                  }`}
                >
                  {day.getDate()}
                </span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    hasAppointments ? 'bg-accent-ink' : 'bg-transparent'
                  }`}
                />
              </Button>
            );
          })}
        </div>
      </Card>

      <section aria-label="Consultas do dia" data-day-list>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            {selectedDay.toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h2>
          {isBookable(selectedDay) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onBook(selectedDay)}
            >
              Agendar neste dia
            </Button>
          )}
        </div>
        {dayClosures.map((closure) => (
          <p key={closure.id} className="mb-2 text-ink-3 text-sm">
            {closure.professionalId === null
              ? `Fechado: ${closure.reason}`
              : `${professionalName(closure.professionalId)} ausente`}
          </p>
        ))}
        {dayAppointments.length === 0 ? (
          <Card className="p-4 text-center text-ink-3 text-sm">
            Nenhuma consulta neste dia.
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {dayAppointments.map((appointment) => (
              <Button
                key={appointment.id}
                type="button"
                variant="ghost"
                onClick={() => onAppointmentClick(appointment)}
                className="h-auto w-full justify-between gap-3 rounded-none px-4 py-3 text-left font-normal"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold tabular-nums">
                    {formatTime(appointment.startsAt)}
                  </span>
                  <span className="truncate">
                    {listPatientName(appointment, homonyms)}
                  </span>
                  <span className="truncate text-ink-3 text-sm">
                    {appointment.procedure}
                  </span>
                </span>
                <StatusBadge
                  status={appointment.status}
                  label={
                    APPOINTMENT_STATUS_LABELS[appointment.status] ??
                    appointment.status
                  }
                />
              </Button>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
