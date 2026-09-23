import type {
  ScheduleClosure,
  WeeklyWindow,
} from '@/domain/scheduling/schedule-availability';

export interface ScheduleClosureDto {
  id: string;
  professionalId: string | null;
  startsOn: string;
  endsOn: string;
  reason: string;
}

export const toScheduleClosureDto = (
  closure: ScheduleClosure,
): ScheduleClosureDto => ({
  id: closure.id,
  professionalId: closure.professionalId,
  startsOn: closure.startsOn,
  endsOn: closure.endsOn,
  reason: closure.reason,
});

export type WeeklyWindowDto = WeeklyWindow;

export interface AffectedAppointmentDto {
  id: string;
  startsAt: string;
  procedure: string;
}
