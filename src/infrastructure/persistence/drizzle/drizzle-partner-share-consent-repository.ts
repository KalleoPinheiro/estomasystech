import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import {
  PartnerShareConsent,
  type PartnerShareConsentActor,
  type PartnerShareConsentKind,
  type PartnerShareConsentRepository,
} from '@/domain/consent/partner-share-consent';
import type { AppDb } from './db';
import { partnerShareConsents } from './schema';
import { withTenant } from './tenant-scope';

type Row = typeof partnerShareConsents.$inferSelect;

const toDomain = (row: Row): PartnerShareConsent =>
  PartnerShareConsent.restore({
    id: row.id,
    patientId: row.patientId,
    partnerId: row.partnerId,
    kind: row.kind as PartnerShareConsentKind,
    textHash: row.textHash,
    textVersion: row.textVersion,
    actor: row.actor as PartnerShareConsentActor,
    recordedBy: row.recordedBy,
    ipAddress: row.ipAddress,
    recordedAt: row.recordedAt,
    signerGuardianId: row.signerGuardianId,
    signerRelationship: row.signerRelationship,
  });

/** Consentimento paciente × parceiro (#292): só insere, nunca atualiza nem apaga. */
export class DrizzlePartnerShareConsentRepository
  implements PartnerShareConsentRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(record: PartnerShareConsent): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar consentimento (somente leitura cross-empresa)',
      );
    }
    await this.db.insert(partnerShareConsents).values({
      id: record.id,
      clinicId: this.clinicId,
      patientId: record.patientId,
      partnerId: record.partnerId,
      kind: record.kind,
      textHash: record.textHash,
      textVersion: record.textVersion,
      actor: record.actor,
      recordedBy: record.recordedBy,
      ipAddress: record.ipAddress,
      recordedAt: record.recordedAt,
      signerGuardianId: record.signer?.guardianId ?? null,
      signerRelationship: record.signer?.relationship ?? null,
    });
  }

  async findByPatientId(patientId: string): Promise<PartnerShareConsent[]> {
    const rows = await this.db
      .select()
      .from(partnerShareConsents)
      .where(
        withTenant(
          partnerShareConsents,
          this.clinicId,
          eq(partnerShareConsents.patientId, patientId),
        ),
      )
      .orderBy(desc(partnerShareConsents.recordedAt));
    return rows.map(toDomain);
  }

  async findByPartnerAndPatientIds(
    partnerId: string,
    patientIds: string[],
  ): Promise<PartnerShareConsent[]> {
    if (patientIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(partnerShareConsents)
      .where(
        withTenant(
          partnerShareConsents,
          this.clinicId,
          and(
            eq(partnerShareConsents.partnerId, partnerId),
            inArray(partnerShareConsents.patientId, patientIds),
          ),
        ),
      )
      .orderBy(desc(partnerShareConsents.recordedAt));
    return rows.map(toDomain);
  }

  async findPatientIdsSignedByRepresentative(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ patientId: partnerShareConsents.patientId })
      .from(partnerShareConsents)
      .where(
        withTenant(
          partnerShareConsents,
          this.clinicId,
          isNotNull(partnerShareConsents.signerGuardianId),
        ),
      );
    return rows.map((row) => row.patientId);
  }
}
