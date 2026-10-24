import type { ScheduleConfig } from '@/domain/scheduling/schedule-config';
import type { AppointmentDto } from '@/lib/dto';

/** Consulta posicionada na coluna do dia: `lane` de `lanes` raias lado a lado. */
export interface PlacedAppointment {
  appointment: AppointmentDto;
  lane: number;
  lanes: number;
}

const startMs = (appointment: AppointmentDto) =>
  new Date(appointment.startsAt).getTime();
const endMs = (appointment: AppointmentDto) =>
  new Date(appointment.endsAt).getTime();

/**
 * Distribui as consultas de um dia em raias: as que se sobrepõem no tempo ficam
 * lado a lado (conflito visível, em vez de uma esconder a outra); as demais
 * ocupam a coluna inteira. Cancelada não ocupa horário e fica de fora.
 */
export function layoutDay(appointments: AppointmentDto[]): PlacedAppointment[] {
  const active = appointments
    .filter((appointment) => appointment.status !== 'cancelled')
    .sort((a, b) => startMs(a) - startMs(b) || endMs(a) - endMs(b));
  const placed: PlacedAppointment[] = [];
  let cluster: PlacedAppointment[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = 0;

  const closeCluster = () => {
    for (const item of cluster) {
      item.lanes = laneEnds.length;
    }
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const appointment of active) {
    if (cluster.length > 0 && startMs(appointment) >= clusterEnd) {
      closeCluster();
    }
    let lane = laneEnds.findIndex((end) => end <= startMs(appointment));
    if (lane === -1) {
      lane = laneEnds.length;
    }
    laneEnds[lane] = endMs(appointment);
    clusterEnd = Math.max(clusterEnd, endMs(appointment));
    cluster.push({ appointment, lane, lanes: 1 });
  }
  closeCluster();
  return placed;
}

const minutesOfDay = (iso: string): number => {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
};

/**
 * Faixa de horas exibida: a da grade da clínica, ampliada para caber qualquer
 * consulta fora dela (consulta nunca fica invisível).
 */
export function visibleHours(
  config: Pick<ScheduleConfig, 'startHour' | 'endHour'>,
  appointments: AppointmentDto[],
): { startHour: number; endHour: number } {
  let startHour = config.startHour;
  let endHour = config.endHour;
  for (const appointment of appointments) {
    if (appointment.status === 'cancelled') continue;
    startHour = Math.min(
      startHour,
      Math.floor(minutesOfDay(appointment.startsAt) / 60),
    );
    endHour = Math.max(
      endHour,
      Math.ceil(minutesOfDay(appointment.endsAt) / 60),
    );
  }
  return { startHour, endHour };
}

/** Posição vertical (em %) de um intervalo dentro da faixa de horas; altura proporcional à duração. */
export function verticalSpan(
  startIso: string,
  endIso: string,
  range: { startHour: number; endHour: number },
): { top: number; height: number } {
  const total = (range.endHour - range.startHour) * 60;
  const top = ((minutesOfDay(startIso) - range.startHour * 60) / total) * 100;
  const rawHeight =
    ((minutesOfDay(endIso) - minutesOfDay(startIso)) / total) * 100;
  return { top, height: Math.max(rawHeight, 2.5) };
}

/**
 * Quanto conteúdo cabe no bloco pela duração (a altura é proporcional a ela):
 * `full` mostra duas linhas (hora e paciente / procedimento); `single` cabe uma
 * linha de texto; `tiny` é o mínimo, uma linha de 14 px. Nunca corta uma linha
 * na vertical (#539).
 */
export type BlockDensity = 'full' | 'single' | 'tiny';

export function blockDensity(startIso: string, endIso: string): BlockDensity {
  const minutes = minutesOfDay(endIso) - minutesOfDay(startIso);
  if (minutes >= 45) return 'full';
  return minutes >= 30 ? 'single' : 'tiny';
}

export { minutesOfDay };
