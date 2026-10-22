import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';
import {
  type ExudateType,
  type InfectionLevel,
  type InfectionSign,
  validateWoundTime,
  type WoundEdge,
  type WoundTimeProps,
} from './wound-time';

export const EXUDATE_LEVELS = ['none', 'low', 'moderate', 'high'] as const;
export type ExudateLevel = (typeof EXUDATE_LEVELS)[number];

/** Tipos de tecido do PUSH 3.0 (subscore 0–4). Texto livre legado permanece válido. */
export const TISSUE_TYPES = [
  'closed',
  'epithelial',
  'granulation',
  'slough',
  'necrotic',
] as const;
export type TissueType = (typeof TISSUE_TYPES)[number];

/** Complicações canônicas de estomia — base de epidemiologia e relatórios. */
export const STOMA_COMPLICATIONS = [
  'dermatitis',
  'prolapse',
  'hernia',
  'retraction',
  'bleeding',
  'granuloma',
  'stenosis',
  'other',
] as const;
export type StomaComplication = (typeof STOMA_COMPLICATIONS)[number];

const MAX_PAIN = 10;
const DET_MAX_AREA = 3;
const DET_MAX_SEVERITY = 2;

const TISSUE_SCORE: Record<TissueType, number> = {
  closed: 0,
  epithelial: 1,
  granulation: 2,
  slough: 3,
  necrotic: 4,
};

const EXUDATE_SCORE: Record<ExudateLevel, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
};

/** Faixas de área do PUSH 3.0 em cm² → subscore 0–10. */
const PUSH_AREA_STEPS: Array<[maxCm2: number, score: number]> = [
  [0, 0],
  [0.3, 1],
  [0.6, 2],
  [1.0, 3],
  [2.0, 4],
  [3.0, 5],
  [4.0, 6],
  [8.0, 7],
  [12.0, 8],
  [24.0, 9],
];

function pushAreaScore(areaCm2: number): number {
  const step = PUSH_AREA_STEPS.find(([max]) => areaCm2 <= max);
  return step ? step[1] : 10;
}

export interface ConditionAssessmentProps extends WoundTimeProps {
  conditionId: string;
  lengthMm?: number | null;
  widthMm?: number | null;
  depthMm?: number | null;
  tissueType?: string | null;
  exudate?: ExudateLevel | null;
  painScale?: number | null;
  skinCondition?: string | null;
  complications?: string | null;
  /** Complicações canônicas (CSV de StomaComplication) — novo padrão estruturado. */
  complicationCodes?: string | null;
  /** Escala DET (estomias): área 0–3 e severidade 0–2 por domínio. */
  detDiscolorationArea?: number | null;
  detDiscolorationSeverity?: number | null;
  detErosionArea?: number | null;
  detErosionSeverity?: number | null;
  detOvergrowthArea?: number | null;
  detOvergrowthSeverity?: number | null;
  notes?: string | null;
}

export interface ConditionAssessmentState extends ConditionAssessmentProps {
  id: string;
  createdAt: Date;
}

export class ConditionAssessment {
  private constructor(private readonly state: ConditionAssessmentState) {}

  private static validate(props: ConditionAssessmentProps): void {
    if (props.conditionId.trim().length === 0) {
      throw new ValidationError('Condição é obrigatória');
    }
    const measurements = [
      ['comprimento', props.lengthMm],
      ['largura', props.widthMm],
      ['profundidade', props.depthMm],
    ] as const;
    for (const [label, value] of measurements) {
      if (value != null && value < 0) {
        throw new ValidationError(`Medida de ${label} não pode ser negativa`);
      }
    }
    if (
      props.painScale != null &&
      (props.painScale < 0 || props.painScale > MAX_PAIN)
    ) {
      throw new ValidationError(
        `Escala de dor deve estar entre 0 e ${MAX_PAIN}`,
      );
    }
    ConditionAssessment.validateDet(props);
    validateWoundTime(props);
    ConditionAssessment.validateComplicationCodes(props.complicationCodes);
  }

  private static validateDet(props: ConditionAssessmentProps): void {
    const areas = [
      props.detDiscolorationArea,
      props.detErosionArea,
      props.detOvergrowthArea,
    ];
    const severities = [
      props.detDiscolorationSeverity,
      props.detErosionSeverity,
      props.detOvergrowthSeverity,
    ];
    const areaValid = areas.every(
      (v) => v == null || (Number.isInteger(v) && v >= 0 && v <= DET_MAX_AREA),
    );
    const severityValid = severities.every(
      (v) =>
        v == null || (Number.isInteger(v) && v >= 0 && v <= DET_MAX_SEVERITY),
    );
    if (!areaValid || !severityValid) {
      throw new ValidationError(
        `DET: área deve ser 0–${DET_MAX_AREA} e severidade 0–${DET_MAX_SEVERITY}`,
      );
    }
  }

  private static validateComplicationCodes(
    codes: string | null | undefined,
  ): void {
    if (!codes?.trim()) {
      return;
    }
    const tokens = codes.split(',').map((token) => token.trim());
    const invalid = tokens.filter(
      (token) => !STOMA_COMPLICATIONS.includes(token as StomaComplication),
    );
    if (invalid.length > 0) {
      throw new ValidationError(
        `Complicações inválidas: ${invalid.join(', ')}`,
      );
    }
  }

  private static normalizeText(
    value: string | null | undefined,
  ): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private static normalizeDet(props: ConditionAssessmentProps) {
    return {
      detDiscolorationArea: props.detDiscolorationArea ?? null,
      detDiscolorationSeverity: props.detDiscolorationSeverity ?? null,
      detErosionArea: props.detErosionArea ?? null,
      detErosionSeverity: props.detErosionSeverity ?? null,
      detOvergrowthArea: props.detOvergrowthArea ?? null,
      detOvergrowthSeverity: props.detOvergrowthSeverity ?? null,
    };
  }

  private static normalizeTime(props: ConditionAssessmentProps) {
    return {
      infectionLevel: props.infectionLevel ?? null,
      infectionSigns: ConditionAssessment.normalizeText(props.infectionSigns),
      woundEdges: props.woundEdges ?? null,
      exudateType: props.exudateType ?? null,
      granulationPct: props.granulationPct ?? null,
      epithelialPct: props.epithelialPct ?? null,
      sloughPct: props.sloughPct ?? null,
      necroticPct: props.necroticPct ?? null,
    };
  }

  static create(props: ConditionAssessmentProps): ConditionAssessment {
    ConditionAssessment.validate(props);
    return new ConditionAssessment({
      conditionId: props.conditionId,
      lengthMm: props.lengthMm ?? null,
      widthMm: props.widthMm ?? null,
      depthMm: props.depthMm ?? null,
      tissueType: ConditionAssessment.normalizeText(props.tissueType),
      exudate: props.exudate ?? null,
      painScale: props.painScale ?? null,
      skinCondition: ConditionAssessment.normalizeText(props.skinCondition),
      complications: ConditionAssessment.normalizeText(props.complications),
      complicationCodes: ConditionAssessment.normalizeText(
        props.complicationCodes,
      ),
      ...ConditionAssessment.normalizeDet(props),
      ...ConditionAssessment.normalizeTime(props),
      notes: ConditionAssessment.normalizeText(props.notes),
      id: newId(),
      createdAt: new Date(),
    });
  }

  static restore(state: ConditionAssessmentState): ConditionAssessment {
    return new ConditionAssessment({ ...state });
  }

  /** Área estimada da ferida (C×L) em mm², ou null quando não medida. */
  get areaMm2(): number | null {
    if (this.state.lengthMm == null || this.state.widthMm == null) {
      return null;
    }
    return this.state.lengthMm * this.state.widthMm;
  }

  get id(): string {
    return this.state.id;
  }

  get conditionId(): string {
    return this.state.conditionId;
  }

  get lengthMm(): number | null {
    return this.state.lengthMm ?? null;
  }

  get widthMm(): number | null {
    return this.state.widthMm ?? null;
  }

  get depthMm(): number | null {
    return this.state.depthMm ?? null;
  }

  get tissueType(): string | null {
    return this.state.tissueType ?? null;
  }

  get exudate(): ExudateLevel | null {
    return this.state.exudate ?? null;
  }

  get painScale(): number | null {
    return this.state.painScale ?? null;
  }

  get skinCondition(): string | null {
    return this.state.skinCondition ?? null;
  }

  get complications(): string | null {
    return this.state.complications ?? null;
  }

  get complicationCodes(): StomaComplication[] {
    const raw = this.state.complicationCodes?.trim();
    if (!raw) {
      return [];
    }
    return raw.split(',').map((token) => token.trim() as StomaComplication);
  }

  /**
   * PUSH 3.0 (feridas): área (0–10) + exsudato (0–3) + tecido (0–4) → 0–17.
   * Null quando falta qualquer componente — o score nunca é chutado.
   */
  get pushScore(): number | null {
    const area = this.areaMm2;
    const exudate = this.state.exudate;
    const tissue = this.state.tissueType;
    if (area == null || exudate == null || !tissue) {
      return null;
    }
    if (!TISSUE_TYPES.includes(tissue as TissueType)) {
      return null; // texto livre legado não pontua
    }
    return (
      pushAreaScore(area / 100) +
      EXUDATE_SCORE[exudate] +
      TISSUE_SCORE[tissue as TissueType]
    );
  }

  /** DET (estomias): soma de (área + severidade) dos 3 domínios → 0–15. Null se incompleto. */
  get detScore(): number | null {
    const domains: Array<
      [number | null | undefined, number | null | undefined]
    > = [
      [this.state.detDiscolorationArea, this.state.detDiscolorationSeverity],
      [this.state.detErosionArea, this.state.detErosionSeverity],
      [this.state.detOvergrowthArea, this.state.detOvergrowthSeverity],
    ];
    let total = 0;
    for (const [area, severity] of domains) {
      if (area == null || severity == null) {
        return null;
      }
      total += area + severity;
    }
    return total;
  }

  get detDiscolorationArea(): number | null {
    return this.state.detDiscolorationArea ?? null;
  }

  get detDiscolorationSeverity(): number | null {
    return this.state.detDiscolorationSeverity ?? null;
  }

  get detErosionArea(): number | null {
    return this.state.detErosionArea ?? null;
  }

  get detErosionSeverity(): number | null {
    return this.state.detErosionSeverity ?? null;
  }

  get detOvergrowthArea(): number | null {
    return this.state.detOvergrowthArea ?? null;
  }

  get detOvergrowthSeverity(): number | null {
    return this.state.detOvergrowthSeverity ?? null;
  }

  get infectionLevel(): InfectionLevel | null {
    return (this.state.infectionLevel as InfectionLevel | null) ?? null;
  }

  get infectionSigns(): InfectionSign[] {
    const raw = this.state.infectionSigns?.trim();
    if (!raw) {
      return [];
    }
    return raw.split(',').map((token) => token.trim() as InfectionSign);
  }

  get woundEdges(): WoundEdge | null {
    return (this.state.woundEdges as WoundEdge | null) ?? null;
  }

  get exudateType(): ExudateType | null {
    return (this.state.exudateType as ExudateType | null) ?? null;
  }

  get granulationPct(): number | null {
    return this.state.granulationPct ?? null;
  }

  get epithelialPct(): number | null {
    return this.state.epithelialPct ?? null;
  }

  get sloughPct(): number | null {
    return this.state.sloughPct ?? null;
  }

  get necroticPct(): number | null {
    return this.state.necroticPct ?? null;
  }

  get notes(): string | null {
    return this.state.notes ?? null;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}
