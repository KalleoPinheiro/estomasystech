import type { AssessmentDto } from '@/lib/dto';
import { INFECTION_LEVEL_LABELS, WOUND_EDGE_LABELS } from '@/lib/format';

/** Resumo de Infecção/Inflamação e Bordas para a tabela de avaliações. */
export function timeSummary(assessment: AssessmentDto): string {
  const parts = [
    assessment.infectionLevel
      ? (INFECTION_LEVEL_LABELS[assessment.infectionLevel] ??
        assessment.infectionLevel)
      : null,
    assessment.woundEdges
      ? `Bordas: ${(WOUND_EDGE_LABELS[assessment.woundEdges] ?? assessment.woundEdges).toLowerCase()}`
      : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/** Perfil de tecido ("Granulação 60% · Esfacelo 40%") quando há percentuais registrados. */
export function tissueProfile(assessment: AssessmentDto): string | null {
  const parts = [
    ['Granulação', assessment.granulationPct],
    ['Epitelização', assessment.epithelialPct],
    ['Esfacelo', assessment.sloughPct],
    ['Necrose', assessment.necroticPct],
  ]
    .filter(([, pct]) => pct != null)
    .map(([label, pct]) => `${label} ${pct}%`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
