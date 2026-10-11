import { asc, desc, eq } from 'drizzle-orm';
import {
  type DataRequestKind,
  type DataRequestStatus,
  DataSubjectRequest,
  type DataSubjectRequestRepository,
} from '@/domain/patient/data-subject-request';
import type { FieldCipher } from '@/lib/data-cipher';
import { type AppDb, MAX_ROWS } from './db';
import { dataSubjectRequests } from './schema';
import { withTenant } from './tenant-scope';

type Row = typeof dataSubjectRequests.$inferSelect;

const toRequest = (row: Row, cipher: FieldCipher): DataSubjectRequest =>
  DataSubjectRequest.restore({
    id: row.id,
    patientId: row.patientId,
    kind: row.kind as DataRequestKind,
    details: cipher.decryptNullable(row.details),
    status: row.status as DataRequestStatus,
    resolution: cipher.decryptNullable(row.resolution),
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  });

export class DrizzleDataSubjectRequestRepository
  implements DataSubjectRequestRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  async save(request: DataSubjectRequest): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode alterar pedidos do titular (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: request.id,
      clinicId: this.clinicId,
      patientId: request.patientId,
      kind: request.kind,
      details: this.cipher.encryptNullable(request.details),
      status: request.status,
      resolution: this.cipher.encryptNullable(request.resolution),
      createdAt: request.createdAt,
      resolvedAt: request.resolvedAt,
    };
    await this.db
      .insert(dataSubjectRequests)
      .values(values)
      .onConflictDoUpdate({
        target: dataSubjectRequests.id,
        set: {
          status: values.status,
          resolution: values.resolution,
          resolvedAt: values.resolvedAt,
        },
        // O upsert não atravessa empresa: id de outra clínica não é alterado.
        setWhere: eq(dataSubjectRequests.clinicId, this.clinicId),
      });
  }

  async findById(id: string): Promise<DataSubjectRequest | null> {
    const rows = await this.db
      .select()
      .from(dataSubjectRequests)
      .where(
        withTenant(
          dataSubjectRequests,
          this.clinicId,
          eq(dataSubjectRequests.id, id),
        ),
      )
      .limit(1);
    return rows[0] ? toRequest(rows[0], this.cipher) : null;
  }

  async findByPatient(patientId: string): Promise<DataSubjectRequest[]> {
    const rows = await this.db
      .select()
      .from(dataSubjectRequests)
      .where(
        withTenant(
          dataSubjectRequests,
          this.clinicId,
          eq(dataSubjectRequests.patientId, patientId),
        ),
      )
      .orderBy(desc(dataSubjectRequests.createdAt))
      .limit(MAX_ROWS);
    return rows.map((row) => toRequest(row, this.cipher));
  }

  async listByStatus(status: DataRequestStatus): Promise<DataSubjectRequest[]> {
    const order =
      status === 'pending'
        ? asc(dataSubjectRequests.createdAt)
        : desc(dataSubjectRequests.resolvedAt);
    const rows = await this.db
      .select()
      .from(dataSubjectRequests)
      .where(
        withTenant(
          dataSubjectRequests,
          this.clinicId,
          eq(dataSubjectRequests.status, status),
        ),
      )
      .orderBy(order)
      .limit(MAX_ROWS);
    return rows.map((row) => toRequest(row, this.cipher));
  }
}
