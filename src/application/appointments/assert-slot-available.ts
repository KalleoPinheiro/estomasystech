import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { assertWithinBusinessHours } from '@/domain/scheduling/business-hours';
import {
  assertNotClosed,
  assertWithinProfessionalHours,
  localDateKey,
  type ScheduleAvailabilityRepository,
} from '@/domain/scheduling/schedule-availability';
import {
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { SchedulingConflictError } from '@/domain/shared/errors';
import type { TimeSlot } from '@/domain/shared/time-slot';

/**
 * Regra única de disponibilidade de horário (agendar e remarcar): grade da
 * clínica (dias, horário, almoço), feriados e ausências, horário do
 * profissional e folga mínima entre consultas ativas.
 */
export async function assertSlotAvailable(
  appointments: AppointmentRepository,
  slot: TimeSlot,
  excludeId?: string,
  config: ScheduleConfig = DEFAULT_SCHEDULE_CONFIG,
  professionalId?: string | null,
  availability?: ScheduleAvailabilityRepository,
): Promise<void> {
  await assertSlotRules(slot, config, professionalId, availability);
  const conflicts = await appointments.findConflicting(
    slot.expand(config.minGapMinutes),
    excludeId,
    professionalId,
  );
  assertNoConflicts(conflicts, config);
}

/**
 * Mesma regra de `assertSlotAvailable`, mas os conflitos vêm de uma consulta
 * única já feita (`findConflicting` de uma janela maior): serve às listagens,
 * que testam dezenas de candidatos sem uma ida ao banco por horário.
 * `pool` precisa ter sido lido com o mesmo `excludeId` e `professionalId`.
 */
export async function assertSlotAvailableAmong(
  pool: readonly Appointment[],
  slot: TimeSlot,
  config: ScheduleConfig,
  professionalId?: string | null,
  availability?: ScheduleAvailabilityRepository,
): Promise<void> {
  await assertSlotRules(slot, config, professionalId, availability);
  const window = slot.expand(config.minGapMinutes);
  assertNoConflicts(
    pool.filter((appointment) => appointment.slot.overlaps(window)),
    config,
  );
}

async function assertSlotRules(
  slot: TimeSlot,
  config: ScheduleConfig,
  professionalId?: string | null,
  availability?: ScheduleAvailabilityRepository,
): Promise<void> {
  assertWithinBusinessHours(slot, config);
  if (availability) {
    await assertAvailableOnCalendar(availability, slot, professionalId ?? null);
  }
}

function assertNoConflicts(
  conflicts: readonly Appointment[],
  config: ScheduleConfig,
): void {
  if (conflicts.length > 0) {
    throw new SchedulingConflictError(
      `Horário indisponível: é necessário intervalo mínimo de ${config.minGapMinutes} minutos entre consultas`,
    );
  }
}

async function assertAvailableOnCalendar(
  availability: ScheduleAvailabilityRepository,
  slot: TimeSlot,
  professionalId: string | null,
): Promise<void> {
  const day = localDateKey(slot.start);
  assertNotClosed(
    slot,
    await availability.listClosures({ from: day, to: day }),
    professionalId,
  );
  if (professionalId) {
    assertWithinProfessionalHours(
      slot,
      await availability.getProfessionalHours(professionalId),
    );
  }
}
