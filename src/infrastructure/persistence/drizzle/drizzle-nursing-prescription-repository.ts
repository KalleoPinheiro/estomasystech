import { desc, eq } from 'drizzle-orm';
import type { NursingPrescriptionRepository } from '@/domain/clinical/clinical-repositories';
import {
  NursingPrescription,
  type PrescriptionContent,
} from '@/domain/clinical/nursing-prescription';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { nursingPrescriptions } from './schema';
import { withTenant } from './tenant-scope';

/**
 * Receituário emitido (#956, ADR-116). O conteúdo inteiro (timbre, paciente,
 * itens, observações e prescritora) é um JSON cifrado numa coluna só: é dado
 * de saúde e nunca é consultado por partes. Grava uma vez; não há update.
 */
export class DrizzleNursingPrescriptionRepository
  implements NursingPrescriptionRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  private toEntity(
    row: typeof nursingPrescriptions.$inferSelect,
  ): NursingPrescription {
    const content = this.cipher.decryptNullable(row.content);
    return NursingPrescription.restore({
      id: row.id,
      carePlanId: row.carePlanId,
      patientId: row.patientId,
      issuedBy: row.issuedBy,
      issuedAt: row.issuedAt,
      content: content ? (JSON.parse(content) as PrescriptionContent) : null,
    });
  }

  async save(prescription: NursingPrescription): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar receituário (somente leitura cross-empresa)',
      );
    }
    const { content } = prescription;
    await this.db.insert(nursingPrescriptions).values({
      id: prescription.id,
      clinicId: this.clinicId,
      carePlanId: prescription.carePlanId,
      patientId: prescription.patientId,
      issuedBy: prescription.issuedBy,
      content: content ? this.cipher.encrypt(JSON.stringify(content)) : null,
      issuedAt: prescription.issuedAt,
    });
  }

  async findById(id: string): Promise<NursingPrescription | null> {
    const [row] = await this.db
      .select()
      .from(nursingPrescriptions)
      .where(
        withTenant(
          nursingPrescriptions,
          this.clinicId,
          eq(nursingPrescriptions.id, id),
        ),
      )
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByCarePlanId(carePlanId: string): Promise<NursingPrescription[]> {
    const rows = await this.db
      .select()
      .from(nursingPrescriptions)
      .where(
        withTenant(
          nursingPrescriptions,
          this.clinicId,
          eq(nursingPrescriptions.carePlanId, carePlanId),
        ),
      )
      .orderBy(
        desc(nursingPrescriptions.issuedAt),
        desc(nursingPrescriptions.id),
      );
    return rows.map((row) => this.toEntity(row));
  }
  async findByPatientId(patientId: string): Promise<NursingPrescription[]> {
    const rows = await this.db
      .select()
      .from(nursingPrescriptions)
      .where(
        withTenant(
          nursingPrescriptions,
          this.clinicId,
          eq(nursingPrescriptions.patientId, patientId),
        ),
      )
      .orderBy(
        desc(nursingPrescriptions.issuedAt),
        desc(nursingPrescriptions.id),
      );
    return rows.map((row) => this.toEntity(row));
  }
}
