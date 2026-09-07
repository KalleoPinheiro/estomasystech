import type { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import type { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import type { ConditionPhoto } from '@/domain/clinical/condition-photo';

export interface ConditionDto {
  id: string;
  patientId: string;
  kind: string;
  title: string;
  stomaType: string | null;
  startedAt: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
}

export const toConditionDto = (condition: ClinicalCondition): ConditionDto => ({
  id: condition.id,
  patientId: condition.patientId,
  kind: condition.kind,
  title: condition.title,
  stomaType: condition.stomaType,
  startedAt: condition.startedAt?.toISOString() ?? null,
  notes: condition.notes,
  status: condition.status,
  createdAt: condition.createdAt.toISOString(),
});

/**
 * DTO allowlist do portal (#69) — sem `notes` (nota interna da equipe).
 * Tipo próprio (não `Omit<ConditionDto, "notes">`) para que um campo novo no
 * domínio não vaze automaticamente: cada campo exposto é citado aqui.
 */
export interface PortalConditionDto {
  id: string;
  patientId: string;
  kind: string;
  title: string;
  stomaType: string | null;
  startedAt: string | null;
  status: string;
  createdAt: string;
}

export const toPortalConditionDto = (
  condition: ClinicalCondition,
): PortalConditionDto => ({
  id: condition.id,
  patientId: condition.patientId,
  kind: condition.kind,
  title: condition.title,
  stomaType: condition.stomaType,
  startedAt: condition.startedAt?.toISOString() ?? null,
  status: condition.status,
  createdAt: condition.createdAt.toISOString(),
});

export interface AssessmentDto {
  id: string;
  conditionId: string;
  lengthMm: number | null;
  widthMm: number | null;
  depthMm: number | null;
  areaMm2: number | null;
  tissueType: string | null;
  exudate: string | null;
  painScale: number | null;
  skinCondition: string | null;
  complications: string | null;
  complicationCodes: string[];
  detScore: number | null;
  pushScore: number | null;
  notes: string | null;
  createdAt: string;
}

export const toAssessmentDto = (
  assessment: ConditionAssessment,
): AssessmentDto => ({
  id: assessment.id,
  conditionId: assessment.conditionId,
  lengthMm: assessment.lengthMm,
  widthMm: assessment.widthMm,
  depthMm: assessment.depthMm,
  areaMm2: assessment.areaMm2,
  tissueType: assessment.tissueType,
  exudate: assessment.exudate,
  painScale: assessment.painScale,
  skinCondition: assessment.skinCondition,
  complications: assessment.complications,
  complicationCodes: assessment.complicationCodes,
  detScore: assessment.detScore,
  pushScore: assessment.pushScore,
  notes: assessment.notes,
  createdAt: assessment.createdAt.toISOString(),
});

/**
 * DTO allowlist do portal (#69, #93) — sem `notes` nem `complications` (texto
 * livre escrito por um profissional pra outro, não pra leitura do paciente/
 * parceiro — achado P0 real de #93, `complicationCodes` codificado continua
 * disponível pra quem quiser status estruturado). Tipo próprio para que um
 * campo novo no domínio não vaze automaticamente.
 */
export interface PortalAssessmentDto {
  id: string;
  conditionId: string;
  lengthMm: number | null;
  widthMm: number | null;
  depthMm: number | null;
  areaMm2: number | null;
  tissueType: string | null;
  exudate: string | null;
  painScale: number | null;
  skinCondition: string | null;
  complicationCodes: string[];
  detScore: number | null;
  pushScore: number | null;
  createdAt: string;
}

export const toPortalAssessmentDto = (
  assessment: ConditionAssessment,
): PortalAssessmentDto => ({
  id: assessment.id,
  conditionId: assessment.conditionId,
  lengthMm: assessment.lengthMm,
  widthMm: assessment.widthMm,
  depthMm: assessment.depthMm,
  areaMm2: assessment.areaMm2,
  tissueType: assessment.tissueType,
  exudate: assessment.exudate,
  painScale: assessment.painScale,
  skinCondition: assessment.skinCondition,
  complicationCodes: assessment.complicationCodes,
  detScore: assessment.detScore,
  pushScore: assessment.pushScore,
  createdAt: assessment.createdAt.toISOString(),
});

export interface ConditionPhotoDto {
  id: string;
  conditionId: string;
  assessmentId: string | null;
  contentType: string;
  sizeBytes: number;
  origin: string;
  patientNote: string | null;
  triageStatus: string | null;
  createdAt: string;
}

export const toConditionPhotoDto = (
  photo: ConditionPhoto,
): ConditionPhotoDto => ({
  id: photo.id,
  conditionId: photo.conditionId,
  assessmentId: photo.assessmentId,
  contentType: photo.contentType,
  sizeBytes: photo.sizeBytes,
  origin: photo.origin,
  patientNote: photo.patientNote,
  triageStatus: photo.triageStatus,
  createdAt: photo.createdAt.toISOString(),
});

/** Item da fila de triagem (`GET /api/photos/triage`) — foto de paciente aguardando revisão do staff. */
export interface TriagePhotoDto {
  id: string;
  conditionTitle: string;
  patientId: string | null;
  patientName: string;
  patientNote: string | null;
  createdAt: string;
  waitingHours: number;
  latestScore: { kind: 'push' | 'det'; value: number } | null;
}
