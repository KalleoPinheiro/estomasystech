import type { FollowUp, FollowUpStatus } from '@/domain/followup/follow-up';
import type { FollowUpRepository } from '@/domain/followup/follow-up-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';

export interface FollowUpWithPatient {
  followUp: FollowUp;
  patientName: string;
  /** Para desambiguar homônimos nas listas (CONTEXT.md). */
  patientBirthDate: Date | null;
  isOverdue: boolean;
}

export interface ListFollowUpsInput {
  status?: FollowUpStatus;
  patientId?: string;
  now?: Date;
}

export class ListFollowUps {
  constructor(
    private readonly followUps: FollowUpRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(
    input: ListFollowUpsInput = {},
  ): Promise<FollowUpWithPatient[]> {
    const now = input.now ?? new Date();
    const followUps = await this.followUps.findAll({
      status: input.status,
      patientId: input.patientId,
    });
    const patients = await this.patients.findByIds(
      followUps.map((f) => f.patientId),
    );
    const byId = new Map(patients.map((p) => [p.id, p]));

    return followUps.map((followUp) => ({
      followUp,
      patientName:
        byId.get(followUp.patientId)?.fullName ?? 'Paciente desconhecido',
      patientBirthDate: byId.get(followUp.patientId)?.birthDate ?? null,
      isOverdue: followUp.isOverdue(now),
    }));
  }
}
