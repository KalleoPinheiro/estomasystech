import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { DressingRecordRepository } from '@/domain/clinical/clinical-repositories';
import {
  type DressingContent,
  type DressingItem,
  type DressingItemRole,
  DressingRecord,
} from '@/domain/clinical/dressing-record';
import { newId } from '@/domain/shared/id';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { dressingRecordItems, dressingRecords } from './schema';
import { withTenant } from './tenant-scope';

/**
 * Registro do curativo em etapas (#963). As etapas são um JSON cifrado numa
 * coluna só, como o receituário (ADR-116): dado de saúde que nunca é consultado
 * por partes. Os insumos usados (T2) ficam em `dressing_record_items`, sem
 * cifra, e gravam na mesma transação. Grava uma vez; não há update (corrigir é
 * registrar outro).
 */
export class DrizzleDressingRecordRepository
  implements DressingRecordRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  private toEntity(
    row: typeof dressingRecords.$inferSelect,
    items: readonly DressingItem[],
  ): DressingRecord {
    const content = this.cipher.decryptNullable(row.content);
    return DressingRecord.restore({
      id: row.id,
      patientId: row.patientId,
      appointmentId: row.appointmentId,
      conditionId: row.conditionId,
      professionalId: row.professionalId,
      createdAt: row.createdAt,
      content: content ? (JSON.parse(content) as DressingContent) : null,
      items,
    });
  }

  /** Itens de cada registro, na ordem em que foram informados. */
  private async itemsOf(
    recordIds: string[],
  ): Promise<Map<string, DressingItem[]>> {
    const byRecord = new Map<string, DressingItem[]>();
    if (recordIds.length === 0) return byRecord;
    const rows = await this.db
      .select()
      .from(dressingRecordItems)
      .where(
        withTenant(
          dressingRecordItems,
          this.clinicId,
          inArray(dressingRecordItems.dressingRecordId, recordIds),
        ),
      )
      .orderBy(asc(dressingRecordItems.position));
    for (const row of rows) {
      const list = byRecord.get(row.dressingRecordId) ?? [];
      list.push({
        role: row.role as DressingItemRole,
        supplyId: row.supplyId,
        quantity: row.quantity,
      });
      byRecord.set(row.dressingRecordId, list);
    }
    return byRecord;
  }

  private async toEntities(
    rows: (typeof dressingRecords.$inferSelect)[],
  ): Promise<DressingRecord[]> {
    const items = await this.itemsOf(rows.map((row) => row.id));
    return rows.map((row) => this.toEntity(row, items.get(row.id) ?? []));
  }

  async save(record: DressingRecord): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar curativo (somente leitura cross-empresa)',
      );
    }
    const clinicId = this.clinicId;
    const { content, items } = record;
    await this.db.transaction(async (tx) => {
      await tx.insert(dressingRecords).values({
        id: record.id,
        clinicId,
        patientId: record.patientId,
        appointmentId: record.appointmentId,
        conditionId: record.conditionId,
        professionalId: record.professionalId,
        content: content ? this.cipher.encrypt(JSON.stringify(content)) : null,
        createdAt: record.createdAt,
      });
      if (items.length === 0) return;
      await tx.insert(dressingRecordItems).values(
        items.map((item, position) => ({
          id: newId(),
          clinicId,
          dressingRecordId: record.id,
          position,
          role: item.role,
          supplyId: item.supplyId,
          quantity: item.quantity,
        })),
      );
    });
  }

  async findByAppointmentId(appointmentId: string): Promise<DressingRecord[]> {
    const rows = await this.db
      .select()
      .from(dressingRecords)
      .where(
        withTenant(
          dressingRecords,
          this.clinicId,
          eq(dressingRecords.appointmentId, appointmentId),
        ),
      )
      .orderBy(asc(dressingRecords.createdAt), asc(dressingRecords.id));
    return this.toEntities(rows);
  }

  async findByPatientId(patientId: string): Promise<DressingRecord[]> {
    const rows = await this.db
      .select()
      .from(dressingRecords)
      .where(
        withTenant(
          dressingRecords,
          this.clinicId,
          eq(dressingRecords.patientId, patientId),
        ),
      )
      .orderBy(desc(dressingRecords.createdAt), desc(dressingRecords.id));
    return this.toEntities(rows);
  }
}
