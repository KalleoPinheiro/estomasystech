import type {
  WaitlistEntry,
  WaitlistSource,
  WaitlistStatus,
} from '@/domain/scheduling/waitlist';

export interface WaitlistEntryDto {
  id: string;
  patientId: string;
  patientName?: string;
  procedureId: string | null;
  procedureName?: string | null;
  professionalId: string | null;
  fromDate: string;
  toDate: string;
  notes: string | null;
  source: WaitlistSource;
  status: WaitlistStatus;
  createdAt: string;
}

export const toWaitlistEntryDto = (
  entry: WaitlistEntry,
  names: { patientName?: string; procedureName?: string | null } = {},
): WaitlistEntryDto => ({
  id: entry.id,
  patientId: entry.patientId,
  patientName: names.patientName,
  procedureId: entry.procedureId,
  procedureName: names.procedureName,
  professionalId: entry.professionalId,
  fromDate: entry.fromDate,
  toDate: entry.toDate,
  notes: entry.notes,
  source: entry.source,
  status: entry.status,
  createdAt: entry.createdAt.toISOString(),
});
