import type { ProfessionalRepository } from '@/domain/professional/professional-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import {
  createScheduleClosure,
  type NewScheduleClosure,
  type ScheduleAvailabilityRepository,
  type ScheduleClosure,
  validateWeeklyWindows,
  type WeeklyWindow,
} from '@/domain/scheduling/schedule-availability';
import { NotFoundError } from '@/domain/shared/errors';

export interface CreatedClosure {
  closure: ScheduleClosure;
  /**
   * Consultas ativas que já estavam marcadas no período bloqueado. Não são
   * canceladas sozinhas: a recepção decide remarcar ou manter caso a caso.
   */
  affectedAppointments: Appointment[];
}

async function assertProfessional(
  professionals: ProfessionalRepository,
  professionalId: string,
): Promise<void> {
  // Repositório com escopo da clínica: profissional de outra empresa não existe.
  if (!(await professionals.findById(professionalId))) {
    throw new NotFoundError('Profissional', professionalId);
  }
}

/** Dia local AAAA-MM-DD → [00:00 do dia, 00:00 do dia seguinte). */
function localDayBounds(startsOn: string, endsOn: string): [Date, Date] {
  const [y1, m1, d1] = startsOn.split('-').map(Number);
  const [y2, m2, d2] = endsOn.split('-').map(Number);
  return [new Date(y1, m1 - 1, d1), new Date(y2, m2 - 1, d2 + 1)];
}

/** Feriado/recesso da clínica ou ausência de um profissional. */
export class CreateScheduleClosure {
  constructor(
    private readonly availability: ScheduleAvailabilityRepository,
    private readonly professionals: ProfessionalRepository,
    private readonly appointments: AppointmentRepository,
  ) {}

  async execute(input: NewScheduleClosure): Promise<CreatedClosure> {
    const closure = createScheduleClosure(input);
    if (closure.professionalId) {
      await assertProfessional(this.professionals, closure.professionalId);
    }
    await this.availability.saveClosure(closure);

    const [start, end] = localDayBounds(closure.startsOn, closure.endsOn);
    const inPeriod = await this.appointments.findInRange(
      start,
      end,
      closure.professionalId
        ? { professionalId: closure.professionalId }
        : undefined,
    );
    return {
      closure,
      affectedAppointments: inPeriod.filter((a) => a.isActive),
    };
  }
}

export class DeleteScheduleClosure {
  constructor(private readonly availability: ScheduleAvailabilityRepository) {}

  async execute(id: string): Promise<ScheduleClosure> {
    const closure = await this.availability.findClosureById(id);
    if (!closure) {
      throw new NotFoundError('Bloqueio de agenda', id);
    }
    await this.availability.deleteClosure(id);
    return closure;
  }
}

/** Horário semanal do profissional; lista vazia = volta a seguir só a clínica. */
export class SetProfessionalHours {
  constructor(
    private readonly availability: ScheduleAvailabilityRepository,
    private readonly professionals: ProfessionalRepository,
  ) {}

  async execute(
    professionalId: string,
    windows: readonly WeeklyWindow[],
  ): Promise<WeeklyWindow[]> {
    await assertProfessional(this.professionals, professionalId);
    const validated = validateWeeklyWindows(windows);
    await this.availability.replaceProfessionalHours(professionalId, validated);
    return validated;
  }
}
