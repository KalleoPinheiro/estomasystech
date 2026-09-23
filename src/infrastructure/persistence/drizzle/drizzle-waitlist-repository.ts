import { asc, desc, eq } from 'drizzle-orm';
import {
  WaitlistEntry,
  type WaitlistRepository,
  type WaitlistSource,
  type WaitlistStatus,
} from '@/domain/scheduling/waitlist';
import { type AppDb, MAX_ROWS } from './db';
import { waitlistEntries } from './schema';
import { withTenant } from './tenant-scope';

type Row = typeof waitlistEntries.$inferSelect;

const toEntry = (row: Row): WaitlistEntry =>
  WaitlistEntry.restore({
    id: row.id,
    patientId: row.patientId,
    procedureId: row.procedureId,
    professionalId: row.professionalId,
    fromDate: row.fromDate,
    toDate: row.toDate,
    notes: row.notes,
    source: row.source as WaitlistSource,
    status: row.status as WaitlistStatus,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  });

export class DrizzleWaitlistRepository implements WaitlistRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(entry: WaitlistEntry): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode alterar a lista de espera (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: entry.id,
      clinicId: this.clinicId,
      patientId: entry.patientId,
      procedureId: entry.procedureId,
      professionalId: entry.professionalId,
      fromDate: entry.fromDate,
      toDate: entry.toDate,
      notes: entry.notes,
      source: entry.source,
      status: entry.status,
      createdAt: entry.createdAt,
      resolvedAt: entry.resolvedAt,
    };
    await this.db
      .insert(waitlistEntries)
      .values(values)
      .onConflictDoUpdate({
        target: waitlistEntries.id,
        set: { status: values.status, resolvedAt: values.resolvedAt },
      });
  }

  async findById(id: string): Promise<WaitlistEntry | null> {
    const rows = await this.db
      .select()
      .from(waitlistEntries)
      .where(
        withTenant(waitlistEntries, this.clinicId, eq(waitlistEntries.id, id)),
      )
      .limit(1);
    return rows[0] ? toEntry(rows[0]) : null;
  }

  async listWaiting(): Promise<WaitlistEntry[]> {
    const rows = await this.db
      .select()
      .from(waitlistEntries)
      .where(
        withTenant(
          waitlistEntries,
          this.clinicId,
          eq(waitlistEntries.status, 'waiting'),
        ),
      )
      .orderBy(asc(waitlistEntries.createdAt))
      .limit(MAX_ROWS);
    return rows.map(toEntry);
  }

  async findByPatient(patientId: string): Promise<WaitlistEntry[]> {
    const rows = await this.db
      .select()
      .from(waitlistEntries)
      .where(
        withTenant(
          waitlistEntries,
          this.clinicId,
          eq(waitlistEntries.patientId, patientId),
        ),
      )
      .orderBy(desc(waitlistEntries.createdAt))
      .limit(MAX_ROWS);
    return rows.map(toEntry);
  }
}
