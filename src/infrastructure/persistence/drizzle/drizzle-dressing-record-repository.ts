import { asc, desc, eq } from 'drizzle-orm';
import type { DressingRecordRepository } from '@/domain/clinical/clinical-repositories';
import {
  type DressingContent,
  DressingRecord,
} from '@/domain/clinical/dressing-record';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { dressingRecords } from './schema';
import { withTenant } from './tenant-scope';

/**
 * Registro do curativo em etapas (#963). As etapas são um JSON cifrado numa
 * coluna só, como o receituário (ADR-116): dado de saúde que nunca é consultado
 * por partes. Grava uma vez; não há update (corrigir é registrar outro).
 */
export class DrizzleDressingRecordRepository
  implements DressingRecordRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  private toEntity(row: typeof dressingRecords.$inferSelect): DressingRecord {
    const content = this.cipher.decryptNullable(row.content);
    return DressingRecord.restore({
      id: row.id,
      patientId: row.patientId,
      appointmentId: row.appointmentId,
      conditionId: row.conditionId,
      professionalId: row.professionalId,
      createdAt: row.createdAt,
      content: content ? (JSON.parse(content) as DressingContent) : null,
    });
  }

  async save(record: DressingRecord): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar curativo (somente leitura cross-empresa)',
      );
    }
    const { content } = record;
    await this.db.insert(dressingRecords).values({
      id: record.id,
      clinicId: this.clinicId,
      patientId: record.patientId,
      appointmentId: record.appointmentId,
      conditionId: record.conditionId,
      professionalId: record.professionalId,
      content: content ? this.cipher.encrypt(JSON.stringify(content)) : null,
      createdAt: record.createdAt,
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
    return rows.map((row) => this.toEntity(row));
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
    return rows.map((row) => this.toEntity(row));
  }
}
