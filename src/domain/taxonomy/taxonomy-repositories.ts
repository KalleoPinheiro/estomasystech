import type { ClinicNursingDiagnosis } from './clinic-nursing-diagnosis';
import type { NursingDiagnosis } from './nursing-diagnosis';
import type { NursingIntervention } from './nursing-intervention';
import type { NursingOutcome } from './nursing-outcome';
import type { LinkageRole, TaxonomyLinkage } from './taxonomy-linkage';

export interface NursingDiagnosisRepository {
  save(diagnosis: NursingDiagnosis): Promise<void>;
  findByCode(code: string): Promise<NursingDiagnosis | null>;
  /** Busca em lote — evita N+1 ao montar diagnósticos de vários planos. */
  findByCodes(codes: string[]): Promise<NursingDiagnosis[]>;
  search(
    term: string,
    options?: { limit?: number },
  ): Promise<NursingDiagnosis[]>;
}

export interface NursingOutcomeRepository {
  save(outcome: NursingOutcome): Promise<void>;
  findByCode(code: string): Promise<NursingOutcome | null>;
  findByCodes(codes: string[]): Promise<NursingOutcome[]>;
  search(term: string, options?: { limit?: number }): Promise<NursingOutcome[]>;
}

export interface NursingInterventionRepository {
  save(intervention: NursingIntervention): Promise<void>;
  findByCode(code: string): Promise<NursingIntervention | null>;
  findByCodes(codes: string[]): Promise<NursingIntervention[]>;
  search(
    term: string,
    options?: { limit?: number },
  ): Promise<NursingIntervention[]>;
}

export interface TaxonomyLinkageRepository {
  save(linkage: TaxonomyLinkage): Promise<void>;
  findByDiagnosisCode(
    diagnosisCode: string,
    role?: LinkageRole,
  ): Promise<TaxonomyLinkage[]>;
}

/** Catálogo de diagnósticos da própria clínica (#954): sempre no escopo da empresa do repositório. */
export interface ClinicNursingDiagnosisRepository {
  save(diagnosis: ClinicNursingDiagnosis): Promise<void>;
  /** Grava várias de uma vez (importação CSV), na mesma transação do chamador. */
  saveMany(diagnoses: ClinicNursingDiagnosis[]): Promise<void>;
  findById(id: string): Promise<ClinicNursingDiagnosis | null>;
  /** Todos, ativos e inativos, por título. */
  list(): Promise<ClinicNursingDiagnosis[]>;
  /** Só os ativos, por título ou código. */
  search(
    term: string,
    options?: { limit?: number },
  ): Promise<ClinicNursingDiagnosis[]>;
}
