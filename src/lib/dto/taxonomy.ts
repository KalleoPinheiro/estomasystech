import type { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import type { NursingIntervention } from '@/domain/taxonomy/nursing-intervention';
import type { NursingOutcome } from '@/domain/taxonomy/nursing-outcome';

export interface NursingDiagnosisDto {
  code: string;
  label: string;
  domain: string;
  class: string;
  definition: string | null;
  edition: string;
}

export const toNursingDiagnosisDto = (
  diagnosis: NursingDiagnosis,
): NursingDiagnosisDto => ({
  code: diagnosis.code,
  label: diagnosis.label,
  domain: diagnosis.domain,
  class: diagnosis.class,
  definition: diagnosis.definition,
  edition: diagnosis.edition,
});

export interface NursingOutcomeDto {
  code: string;
  label: string;
  domain: string;
  class: string;
  edition: string;
  /** Rótulos da escala 1–5, índice 0 = pontuação 1. */
  scaleAnchors: string[];
}

export const toNursingOutcomeDto = (
  outcome: NursingOutcome,
): NursingOutcomeDto => ({
  code: outcome.code,
  label: outcome.label,
  domain: outcome.domain,
  class: outcome.class,
  edition: outcome.edition,
  scaleAnchors: [...outcome.scale.anchors],
});

export interface NursingInterventionDto {
  code: string;
  label: string;
  domain: string;
  class: string;
  edition: string;
}

export const toNursingInterventionDto = (
  intervention: NursingIntervention,
): NursingInterventionDto => ({
  code: intervention.code,
  label: intervention.label,
  domain: intervention.domain,
  class: intervention.class,
  edition: intervention.edition,
});
