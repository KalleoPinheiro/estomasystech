import type { ClinicNursingDiagnosis } from '@/domain/taxonomy/clinic-nursing-diagnosis';
import type { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import type { NursingIntervention } from '@/domain/taxonomy/nursing-intervention';
import type { NursingOutcome } from '@/domain/taxonomy/nursing-outcome';
import type {
  LinkageRole,
  TaxonomyLinkage,
} from '@/domain/taxonomy/taxonomy-linkage';
import type {
  ClinicNursingDiagnosisRepository,
  NursingDiagnosisRepository,
  NursingInterventionRepository,
  NursingOutcomeRepository,
  TaxonomyLinkageRepository,
} from '@/domain/taxonomy/taxonomy-repositories';

const DEFAULT_SEARCH_LIMIT = 20;

const matches = (term: string, ...fields: string[]): boolean => {
  const needle = term.toLowerCase();
  return fields.some((field) => field.toLowerCase().includes(needle));
};

export class InMemoryNursingDiagnosisRepository
  implements NursingDiagnosisRepository
{
  private readonly items = new Map<string, NursingDiagnosis>();

  async save(diagnosis: NursingDiagnosis): Promise<void> {
    this.items.set(diagnosis.id, diagnosis);
  }

  async findByCode(code: string): Promise<NursingDiagnosis | null> {
    return [...this.items.values()].find((item) => item.code === code) ?? null;
  }

  async findByCodes(codes: string[]): Promise<NursingDiagnosis[]> {
    const set = new Set(codes);
    return [...this.items.values()].filter((item) => set.has(item.code));
  }

  async search(
    term: string,
    options?: { limit?: number },
  ): Promise<NursingDiagnosis[]> {
    return [...this.items.values()]
      .filter((item) => matches(term, item.label, item.code))
      .slice(0, options?.limit ?? DEFAULT_SEARCH_LIMIT);
  }
}

export class InMemoryNursingOutcomeRepository
  implements NursingOutcomeRepository
{
  private readonly items = new Map<string, NursingOutcome>();

  async save(outcome: NursingOutcome): Promise<void> {
    this.items.set(outcome.id, outcome);
  }

  async findByCode(code: string): Promise<NursingOutcome | null> {
    return [...this.items.values()].find((item) => item.code === code) ?? null;
  }

  async findByCodes(codes: string[]): Promise<NursingOutcome[]> {
    const set = new Set(codes);
    return [...this.items.values()].filter((item) => set.has(item.code));
  }

  async search(
    term: string,
    options?: { limit?: number },
  ): Promise<NursingOutcome[]> {
    return [...this.items.values()]
      .filter((item) => matches(term, item.label, item.code))
      .slice(0, options?.limit ?? DEFAULT_SEARCH_LIMIT);
  }
}

export class InMemoryNursingInterventionRepository
  implements NursingInterventionRepository
{
  private readonly items = new Map<string, NursingIntervention>();

  async save(intervention: NursingIntervention): Promise<void> {
    this.items.set(intervention.id, intervention);
  }

  async findByCode(code: string): Promise<NursingIntervention | null> {
    return [...this.items.values()].find((item) => item.code === code) ?? null;
  }

  async findByCodes(codes: string[]): Promise<NursingIntervention[]> {
    const set = new Set(codes);
    return [...this.items.values()].filter((item) => set.has(item.code));
  }

  async search(
    term: string,
    options?: { limit?: number },
  ): Promise<NursingIntervention[]> {
    return [...this.items.values()]
      .filter((item) => matches(term, item.label, item.code))
      .slice(0, options?.limit ?? DEFAULT_SEARCH_LIMIT);
  }
}

export class InMemoryTaxonomyLinkageRepository
  implements TaxonomyLinkageRepository
{
  private readonly items: TaxonomyLinkage[] = [];

  async save(linkage: TaxonomyLinkage): Promise<void> {
    this.items.push(linkage);
  }

  async findByDiagnosisCode(
    diagnosisCode: string,
    role?: LinkageRole,
  ): Promise<TaxonomyLinkage[]> {
    return this.items.filter(
      (link) =>
        link.diagnosisCode === diagnosisCode && (!role || link.role === role),
    );
  }
}

/** Catálogo da clínica em memória (#954): um repositório por empresa, como no Drizzle. */
export class InMemoryClinicNursingDiagnosisRepository
  implements ClinicNursingDiagnosisRepository
{
  private readonly items = new Map<string, ClinicNursingDiagnosis>();

  async save(diagnosis: ClinicNursingDiagnosis): Promise<void> {
    this.items.set(diagnosis.id, diagnosis);
  }

  async saveMany(diagnoses: ClinicNursingDiagnosis[]): Promise<void> {
    for (const diagnosis of diagnoses) {
      this.items.set(diagnosis.id, diagnosis);
    }
  }

  async findById(id: string): Promise<ClinicNursingDiagnosis | null> {
    return this.items.get(id) ?? null;
  }

  async list(): Promise<ClinicNursingDiagnosis[]> {
    return [...this.items.values()].sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR'),
    );
  }

  async search(
    term: string,
    options?: { limit?: number },
  ): Promise<ClinicNursingDiagnosis[]> {
    return (await this.list())
      .filter(
        (item) => item.isActive && matches(term, item.label, item.code ?? ''),
      )
      .slice(0, options?.limit ?? DEFAULT_SEARCH_LIMIT);
  }
}
