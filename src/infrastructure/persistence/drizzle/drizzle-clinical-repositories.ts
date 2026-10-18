import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { Anamnesis } from '@/domain/clinical/anamnesis';
import {
  ClinicalCondition,
  type ConditionKind,
  type ConditionStatus,
  type StomaType,
} from '@/domain/clinical/clinical-condition';
import type {
  AnamnesisRepository,
  ClinicalConditionRepository,
  ConditionAssessmentRepository,
  ConditionPhotoRepository,
  EvolutionNoteRepository,
} from '@/domain/clinical/clinical-repositories';
import {
  ConditionAssessment,
  type ExudateLevel,
} from '@/domain/clinical/condition-assessment';
import {
  ConditionPhoto,
  type PhotoContentType,
  type PhotoOrigin,
  type TriageStatus,
} from '@/domain/clinical/condition-photo';
import { EvolutionNote } from '@/domain/clinical/evolution-note';
import {
  type ConsentPurpose,
  ConsentRecord,
  type ConsentRecordKind,
  type ConsentRecordRepository,
} from '@/domain/consent/consent-record';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import {
  anamneses,
  clinicalConditions,
  conditionAssessments,
  conditionPhotos,
  consentRecords,
  evolutionNotes,
} from './schema';
import { withTenant } from './tenant-scope';

export class DrizzleAnamnesisRepository implements AnamnesisRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  async save(anamnesis: Anamnesis): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar anamnese (somente leitura cross-empresa)',
      );
    }
    const values = {
      clinicId: this.clinicId,
      patientId: anamnesis.patientId,
      comorbidities: this.cipher.encryptNullable(anamnesis.comorbidities) ?? '',
      allergies: this.cipher.encryptNullable(anamnesis.allergies) ?? '',
      medications: this.cipher.encryptNullable(anamnesis.medications) ?? '',
      surgicalHistory:
        this.cipher.encryptNullable(anamnesis.surgicalHistory) ?? '',
      notes: this.cipher.encryptNullable(anamnesis.notes) ?? '',
      updatedAt: anamnesis.updatedAt,
    };
    await this.db
      .insert(anamneses)
      .values(values)
      .onConflictDoUpdate({ target: anamneses.patientId, set: values });
  }

  async findByPatientId(patientId: string): Promise<Anamnesis | null> {
    const rows = await this.db
      .select()
      .from(anamneses)
      .where(
        withTenant(
          anamneses,
          this.clinicId,
          eq(anamneses.patientId, patientId),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    // Anamnese cifrada em repouso (#195); "" segue "" (nada a proteger).
    return Anamnesis.restore({
      ...row,
      comorbidities: this.cipher.decryptNullable(row.comorbidities) ?? '',
      allergies: this.cipher.decryptNullable(row.allergies) ?? '',
      medications: this.cipher.decryptNullable(row.medications) ?? '',
      surgicalHistory: this.cipher.decryptNullable(row.surgicalHistory) ?? '',
      notes: this.cipher.decryptNullable(row.notes) ?? '',
    });
  }
}

export class DrizzleEvolutionNoteRepository implements EvolutionNoteRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  private toEntity(row: typeof evolutionNotes.$inferSelect): EvolutionNote {
    return EvolutionNote.restore({
      ...row,
      subjective: this.cipher.decryptNullable(row.subjective) ?? '',
      objective: this.cipher.decryptNullable(row.objective) ?? '',
      assessment: this.cipher.decryptNullable(row.assessment) ?? '',
      plan: this.cipher.decryptNullable(row.plan) ?? '',
    });
  }

  async save(note: EvolutionNote): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar nota de evolução (somente leitura cross-empresa)',
      );
    }
    await this.db.insert(evolutionNotes).values({
      id: note.id,
      clinicId: this.clinicId,
      patientId: note.patientId,
      appointmentId: note.appointmentId,
      professionalId: note.professionalId,
      subjective: this.cipher.encryptNullable(note.subjective) ?? '',
      objective: this.cipher.encryptNullable(note.objective) ?? '',
      assessment: this.cipher.encryptNullable(note.assessment) ?? '',
      plan: this.cipher.encryptNullable(note.plan) ?? '',
      createdAt: note.createdAt,
    });
  }

  async findByPatientId(patientId: string): Promise<EvolutionNote[]> {
    const rows = await this.db
      .select()
      .from(evolutionNotes)
      .where(
        withTenant(
          evolutionNotes,
          this.clinicId,
          eq(evolutionNotes.patientId, patientId),
        ),
      )
      .orderBy(desc(evolutionNotes.createdAt), desc(evolutionNotes.id));
    return rows.map((row) => this.toEntity(row));
  }
}

export class DrizzleClinicalConditionRepository
  implements ClinicalConditionRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  private toEntity(
    row: typeof clinicalConditions.$inferSelect,
  ): ClinicalCondition {
    return ClinicalCondition.restore({
      ...row,
      notes: this.cipher.decryptNullable(row.notes),
      kind: row.kind as ConditionKind,
      stomaType: row.stomaType as StomaType | null,
      status: row.status as ConditionStatus,
    });
  }

  async save(condition: ClinicalCondition): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar condição clínica (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: condition.id,
      clinicId: this.clinicId,
      patientId: condition.patientId,
      kind: condition.kind,
      title: condition.title,
      stomaType: condition.stomaType,
      startedAt: condition.startedAt,
      notes: this.cipher.encryptNullable(condition.notes),
      status: condition.status,
      createdAt: condition.createdAt,
    };
    await this.db
      .insert(clinicalConditions)
      .values(values)
      .onConflictDoUpdate({ target: clinicalConditions.id, set: values });
  }

  async findById(id: string): Promise<ClinicalCondition | null> {
    const rows = await this.db
      .select()
      .from(clinicalConditions)
      .where(
        withTenant(
          clinicalConditions,
          this.clinicId,
          eq(clinicalConditions.id, id),
        ),
      )
      .limit(1);
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findByPatientId(patientId: string): Promise<ClinicalCondition[]> {
    const rows = await this.db
      .select()
      .from(clinicalConditions)
      .where(
        withTenant(
          clinicalConditions,
          this.clinicId,
          eq(clinicalConditions.patientId, patientId),
        ),
      )
      .orderBy(desc(clinicalConditions.createdAt));
    return rows.map((row) => this.toEntity(row));
  }

  async findByIds(ids: string[]): Promise<ClinicalCondition[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(clinicalConditions)
      .where(
        withTenant(
          clinicalConditions,
          this.clinicId,
          inArray(clinicalConditions.id, unique),
        ),
      );
    return rows.map((row) => this.toEntity(row));
  }

  async findByPatientIds(patientIds: string[]): Promise<ClinicalCondition[]> {
    const unique = [...new Set(patientIds)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(clinicalConditions)
      .where(
        withTenant(
          clinicalConditions,
          this.clinicId,
          inArray(clinicalConditions.patientId, unique),
        ),
      )
      .orderBy(desc(clinicalConditions.createdAt));
    return rows.map((row) => this.toEntity(row));
  }
}

export class DrizzleConditionAssessmentRepository
  implements ConditionAssessmentRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  private toEntity(
    row: typeof conditionAssessments.$inferSelect,
  ): ConditionAssessment {
    return ConditionAssessment.restore({
      ...row,
      notes: this.cipher.decryptNullable(row.notes),
      skinCondition: this.cipher.decryptNullable(row.skinCondition),
      complications: this.cipher.decryptNullable(row.complications),
      exudate: row.exudate as ExudateLevel | null,
    });
  }

  async save(assessment: ConditionAssessment): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar avaliação de condição (somente leitura cross-empresa)',
      );
    }
    await this.db.insert(conditionAssessments).values({
      id: assessment.id,
      clinicId: this.clinicId,
      conditionId: assessment.conditionId,
      lengthMm: assessment.lengthMm,
      widthMm: assessment.widthMm,
      depthMm: assessment.depthMm,
      tissueType: assessment.tissueType,
      exudate: assessment.exudate,
      painScale: assessment.painScale,
      skinCondition: this.cipher.encryptNullable(assessment.skinCondition),
      complications: this.cipher.encryptNullable(assessment.complications),
      complicationCodes:
        assessment.complicationCodes.length > 0
          ? assessment.complicationCodes.join(',')
          : null,
      detDiscolorationArea: assessment.detDiscolorationArea,
      detDiscolorationSeverity: assessment.detDiscolorationSeverity,
      detErosionArea: assessment.detErosionArea,
      detErosionSeverity: assessment.detErosionSeverity,
      detOvergrowthArea: assessment.detOvergrowthArea,
      detOvergrowthSeverity: assessment.detOvergrowthSeverity,
      notes: this.cipher.encryptNullable(assessment.notes),
      createdAt: assessment.createdAt,
    });
  }

  async findByConditionId(conditionId: string): Promise<ConditionAssessment[]> {
    const rows = await this.db
      .select()
      .from(conditionAssessments)
      .where(
        withTenant(
          conditionAssessments,
          this.clinicId,
          eq(conditionAssessments.conditionId, conditionId),
        ),
      )
      .orderBy(
        desc(conditionAssessments.createdAt),
        desc(conditionAssessments.id),
      );
    return rows.map((row) => this.toEntity(row));
  }

  async findByConditionIds(
    conditionIds: string[],
  ): Promise<ConditionAssessment[]> {
    const unique = [...new Set(conditionIds)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(conditionAssessments)
      .where(
        withTenant(
          conditionAssessments,
          this.clinicId,
          inArray(conditionAssessments.conditionId, unique),
        ),
      )
      .orderBy(
        desc(conditionAssessments.createdAt),
        desc(conditionAssessments.id),
      );
    return rows.map((row) => this.toEntity(row));
  }
}

export class DrizzleConditionPhotoRepository
  implements ConditionPhotoRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  private toEntity(row: typeof conditionPhotos.$inferSelect): ConditionPhoto {
    return ConditionPhoto.restore({
      ...row,
      contentType: row.contentType as PhotoContentType,
      origin: row.origin as PhotoOrigin,
      triageStatus: row.triageStatus as TriageStatus | null,
      patientNote: this.cipher.decryptNullable(row.patientNote),
    });
  }

  async save(photo: ConditionPhoto): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar foto de condição (somente leitura cross-empresa)',
      );
    }
    const values = {
      id: photo.id,
      clinicId: this.clinicId,
      conditionId: photo.conditionId,
      assessmentId: photo.assessmentId,
      contentType: photo.contentType,
      sizeBytes: photo.sizeBytes,
      origin: photo.origin,
      patientNote: this.cipher.encryptNullable(photo.patientNote),
      triageStatus: photo.triageStatus,
      createdAt: photo.createdAt,
    };
    // Upsert: triagem atualiza o registro existente.
    await this.db
      .insert(conditionPhotos)
      .values(values)
      .onConflictDoUpdate({ target: conditionPhotos.id, set: values });
  }

  async findPendingTriage(): Promise<ConditionPhoto[]> {
    const rows = await this.db
      .select()
      .from(conditionPhotos)
      .where(
        withTenant(
          conditionPhotos,
          this.clinicId,
          eq(conditionPhotos.triageStatus, 'pending'),
        ),
      )
      .orderBy(desc(conditionPhotos.createdAt));
    return rows.map((row) => this.toEntity(row));
  }

  async findById(id: string): Promise<ConditionPhoto | null> {
    const rows = await this.db
      .select()
      .from(conditionPhotos)
      .where(
        withTenant(conditionPhotos, this.clinicId, eq(conditionPhotos.id, id)),
      )
      .limit(1);
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findByConditionId(conditionId: string): Promise<ConditionPhoto[]> {
    const rows = await this.db
      .select()
      .from(conditionPhotos)
      .where(
        withTenant(
          conditionPhotos,
          this.clinicId,
          eq(conditionPhotos.conditionId, conditionId),
        ),
      )
      .orderBy(desc(conditionPhotos.createdAt), desc(conditionPhotos.id));
    return rows.map((row) => this.toEntity(row));
  }

  async findByConditionIds(conditionIds: string[]): Promise<ConditionPhoto[]> {
    const unique = [...new Set(conditionIds)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(conditionPhotos)
      .where(
        withTenant(
          conditionPhotos,
          this.clinicId,
          inArray(conditionPhotos.conditionId, unique),
        ),
      )
      .orderBy(desc(conditionPhotos.createdAt), desc(conditionPhotos.id));
    return rows.map((row) => this.toEntity(row));
  }

  async countPatientUploadsSince(
    conditionIds: string[],
    since: Date,
  ): Promise<number> {
    const unique = [...new Set(conditionIds)];
    if (unique.length === 0) {
      return 0;
    }
    const [row] = await this.db
      .select({ total: count() })
      .from(conditionPhotos)
      .where(
        withTenant(
          conditionPhotos,
          this.clinicId,
          and(
            inArray(conditionPhotos.conditionId, unique),
            eq(conditionPhotos.origin, 'patient'),
            gte(conditionPhotos.createdAt, since),
          ),
        ),
      );
    return row?.total ?? 0;
  }

  async delete(id: string): Promise<void> {
    await this.db
      .delete(conditionPhotos)
      .where(
        withTenant(conditionPhotos, this.clinicId, eq(conditionPhotos.id, id)),
      );
  }
}

export class DrizzleConsentRecordRepository implements ConsentRecordRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  async save(record: ConsentRecord): Promise<void> {
    if (this.clinicId === null) {
      throw new Error(
        'Papel de sistema não pode salvar consentimento (somente leitura cross-empresa)',
      );
    }
    await this.db.insert(consentRecords).values({
      id: record.id,
      clinicId: this.clinicId,
      patientId: record.patientId,
      kind: record.kind,
      purpose: record.purpose,
      textHash: record.textHash,
      textVersion: record.textVersion,
      controllerSnapshot: record.controllerSnapshot,
      signerGuardianId: record.signer?.guardianId ?? null,
      signerRelationship: record.signer?.relationship ?? null,
      ipAddress: record.ipAddress,
      acceptedAt: record.acceptedAt,
    });
  }

  async findByPatientId(patientId: string): Promise<ConsentRecord[]> {
    const rows = await this.db
      .select()
      .from(consentRecords)
      .where(
        withTenant(
          consentRecords,
          this.clinicId,
          eq(consentRecords.patientId, patientId),
        ),
      )
      .orderBy(desc(consentRecords.acceptedAt));
    return rows.map((row) =>
      ConsentRecord.restore({
        ...row,
        kind: row.kind as ConsentRecordKind,
        purpose: row.purpose as ConsentPurpose,
      }),
    );
  }

  async findLatestByPatientId(
    patientId: string,
  ): Promise<ConsentRecord | null> {
    const [row] = await this.db
      .select()
      .from(consentRecords)
      .where(
        withTenant(
          consentRecords,
          this.clinicId,
          eq(consentRecords.patientId, patientId),
        ),
      )
      .orderBy(desc(consentRecords.acceptedAt))
      .limit(1);
    return row
      ? ConsentRecord.restore({
          ...row,
          kind: row.kind as ConsentRecordKind,
          purpose: row.purpose as ConsentPurpose,
        })
      : null;
  }
}
