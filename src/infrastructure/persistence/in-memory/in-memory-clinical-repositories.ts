import type { Anamnesis } from '@/domain/clinical/anamnesis';
import type { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import type {
  AnamnesisRepository,
  ClinicalConditionRepository,
  ConditionAssessmentRepository,
  ConditionPhotoRepository,
  EvolutionNoteRepository,
} from '@/domain/clinical/clinical-repositories';
import type { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import type { ConditionPhoto } from '@/domain/clinical/condition-photo';
import type { EvolutionNote } from '@/domain/clinical/evolution-note';
import type {
  ConsentRecord,
  ConsentRecordRepository,
} from '@/domain/consent/consent-record';
import type {
  PartnerShareConsent,
  PartnerShareConsentRepository,
} from '@/domain/consent/partner-share-consent';

export class InMemoryAnamnesisRepository implements AnamnesisRepository {
  private readonly items = new Map<string, Anamnesis>();

  async save(anamnesis: Anamnesis): Promise<void> {
    this.items.set(anamnesis.patientId, anamnesis);
  }

  async findByPatientId(patientId: string): Promise<Anamnesis | null> {
    return this.items.get(patientId) ?? null;
  }
}

export class InMemoryEvolutionNoteRepository
  implements EvolutionNoteRepository
{
  private readonly items = new Map<string, EvolutionNote>();
  private readonly insertionOrder = new Map<string, number>();
  private sequence = 0;

  async save(note: EvolutionNote): Promise<void> {
    this.items.set(note.id, note);
    if (!this.insertionOrder.has(note.id)) {
      this.sequence += 1;
      this.insertionOrder.set(note.id, this.sequence);
    }
  }

  async findByPatientId(patientId: string): Promise<EvolutionNote[]> {
    return [...this.items.values()]
      .filter((n) => n.patientId === patientId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          (this.insertionOrder.get(b.id) ?? 0) -
            (this.insertionOrder.get(a.id) ?? 0),
      );
  }
}

export class InMemoryClinicalConditionRepository
  implements ClinicalConditionRepository
{
  private readonly items = new Map<string, ClinicalCondition>();

  async save(condition: ClinicalCondition): Promise<void> {
    this.items.set(condition.id, condition);
  }

  async findById(id: string): Promise<ClinicalCondition | null> {
    return this.items.get(id) ?? null;
  }

  async findByPatientId(patientId: string): Promise<ClinicalCondition[]> {
    return [...this.items.values()]
      .filter((c) => c.patientId === patientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByIds(ids: string[]): Promise<ClinicalCondition[]> {
    const unique = new Set(ids);
    return [...this.items.values()].filter((c) => unique.has(c.id));
  }

  async findByPatientIds(patientIds: string[]): Promise<ClinicalCondition[]> {
    const ids = new Set(patientIds);
    return [...this.items.values()]
      .filter((c) => ids.has(c.patientId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

export class InMemoryConditionAssessmentRepository
  implements ConditionAssessmentRepository
{
  private readonly items = new Map<string, ConditionAssessment>();

  async save(assessment: ConditionAssessment): Promise<void> {
    this.items.set(assessment.id, assessment);
  }

  async findByConditionId(conditionId: string): Promise<ConditionAssessment[]> {
    return [...this.items.values()]
      .filter((a) => a.conditionId === conditionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByConditionIds(
    conditionIds: string[],
  ): Promise<ConditionAssessment[]> {
    const ids = new Set(conditionIds);
    return [...this.items.values()]
      .filter((a) => ids.has(a.conditionId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

export class InMemoryConditionPhotoRepository
  implements ConditionPhotoRepository
{
  private readonly items = new Map<string, ConditionPhoto>();

  async save(photo: ConditionPhoto): Promise<void> {
    this.items.set(photo.id, photo);
  }

  async findById(id: string): Promise<ConditionPhoto | null> {
    return this.items.get(id) ?? null;
  }

  async findByConditionId(conditionId: string): Promise<ConditionPhoto[]> {
    return [...this.items.values()]
      .filter((p) => p.conditionId === conditionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByConditionIds(conditionIds: string[]): Promise<ConditionPhoto[]> {
    const ids = new Set(conditionIds);
    return [...this.items.values()]
      .filter((p) => ids.has(p.conditionId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async countPatientUploadsSince(
    conditionIds: string[],
    since: Date,
  ): Promise<number> {
    const ids = new Set(conditionIds);
    return [...this.items.values()].filter(
      (p) =>
        ids.has(p.conditionId) &&
        p.origin === 'patient' &&
        p.createdAt.getTime() >= since.getTime(),
    ).length;
  }

  async findPendingTriage(): Promise<ConditionPhoto[]> {
    return [...this.items.values()]
      .filter((p) => p.triageStatus === 'pending')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
}

export class InMemoryConsentRecordRepository
  implements ConsentRecordRepository
{
  private readonly items: ConsentRecord[] = [];

  async save(record: ConsentRecord): Promise<void> {
    this.items.push(record);
  }

  async findByPatientId(patientId: string): Promise<ConsentRecord[]> {
    return this.items
      .filter((r) => r.patientId === patientId)
      .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime());
  }

  async findLatestByPatientId(
    patientId: string,
  ): Promise<ConsentRecord | null> {
    const records = await this.findByPatientId(patientId);
    return records[0] ?? null;
  }
}

export class InMemoryPartnerShareConsentRepository
  implements PartnerShareConsentRepository
{
  private readonly items: PartnerShareConsent[] = [];

  async save(record: PartnerShareConsent): Promise<void> {
    this.items.push(record);
  }

  async findByPatientId(patientId: string): Promise<PartnerShareConsent[]> {
    return this.items
      .filter((r) => r.patientId === patientId)
      .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
  }

  async findByPartnerAndPatientIds(
    partnerId: string,
    patientIds: string[],
  ): Promise<PartnerShareConsent[]> {
    const wanted = new Set(patientIds);
    return this.items
      .filter((r) => r.partnerId === partnerId && wanted.has(r.patientId))
      .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
  }
}
