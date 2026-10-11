import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import {
  WaitlistEntry,
  type WaitlistRepository,
  type WaitlistSource,
  type WaitlistStatus,
} from '@/domain/scheduling/waitlist';
import type { FieldCipher } from '@/lib/data-cipher';
import { type AppDb, MAX_ROWS } from './db';
import { waitlistEntries } from './schema';
import { withTenant } from './tenant-scope';

type Row = typeof waitlistEntries.$inferSelect;
/** Entrada com paciente: as leituras filtram as anonimizadas (#294). */
type LiveRow = Row & { patientId: string };

/** Entrada anonimizada pela retenção (#294) não tem paciente nem volta à fila. */
const notAnonymized = isNotNull(waitlistEntries.patientId);
const hasPatient = (row: Row): row is LiveRow => row.patientId !== null;

const toEntry = (row: LiveRow, cipher: FieldCipher): WaitlistEntry =>
  WaitlistEntry.restore({
    id: row.id,
    patientId: row.patientId,
    procedureId: row.procedureId,
    professionalId: row.professionalId,
    fromDate: row.fromDate,
    toDate: row.toDate,
    notes: cipher.decryptNullable(row.notes),
    source: row.source as WaitlistSource,
    status: row.status as WaitlistStatus,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  });

export class DrizzleWaitlistRepository implements WaitlistRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
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
      notes: this.cipher.encryptNullable(entry.notes),
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
        withTenant(
          waitlistEntries,
          this.clinicId,
          and(eq(waitlistEntries.id, id), notAnonymized),
        ),
      )
      .limit(1);
    const row = rows.find(hasPatient);
    return row ? toEntry(row, this.cipher) : null;
  }

  async listWaiting(): Promise<WaitlistEntry[]> {
    const rows = await this.db
      .select()
      .from(waitlistEntries)
      .where(
        withTenant(
          waitlistEntries,
          this.clinicId,
          and(eq(waitlistEntries.status, 'waiting'), notAnonymized),
        ),
      )
      .orderBy(asc(waitlistEntries.createdAt))
      .limit(MAX_ROWS);
    return rows.filter(hasPatient).map((row) => toEntry(row, this.cipher));
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
    // `eq` com o id do paciente já exclui as anonimizadas (paciente nulo).
    return rows.filter(hasPatient).map((row) => toEntry(row, this.cipher));
  }
}
