import type { AppointmentStatus } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';

export interface CountAppointmentsByStatusInput {
  from: Date;
  to: Date;
  professionalId?: string;
}

/** Contagem por status do período visível, independente do filtro de status (AGE-FLT-05). */
export class CountAppointmentsByStatus {
  constructor(private readonly appointments: AppointmentRepository) {}

  execute(
    input: CountAppointmentsByStatusInput,
  ): Promise<Record<AppointmentStatus, number>> {
    return this.appointments.countByStatusInRange(input.from, input.to, {
      professionalId: input.professionalId,
    });
  }
}
