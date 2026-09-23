import type { WaitlistEntry } from '@/domain/scheduling/waitlist';
import type { Services } from '@/infrastructure/container';
import { toWaitlistEntryDto, type WaitlistEntryDto } from '@/lib/dto';

/** DTOs da fila com nome do paciente e do procedimento (sem N+1). */
export async function waitlistWithNames(
  services: Pick<Services, 'patients' | 'procedures'>,
  entries: WaitlistEntry[],
): Promise<WaitlistEntryDto[]> {
  const patients = await services.patients.findByIds(
    entries.map((entry) => entry.patientId),
  );
  const procedures = await services.procedures.findAll();
  const patientName = new Map(patients.map((p) => [p.id, p.fullName]));
  const procedureName = new Map(procedures.map((p) => [p.id, p.name]));
  return entries.map((entry) =>
    toWaitlistEntryDto(entry, {
      patientName: patientName.get(entry.patientId),
      procedureName: entry.procedureId
        ? (procedureName.get(entry.procedureId) ?? null)
        : null,
    }),
  );
}
