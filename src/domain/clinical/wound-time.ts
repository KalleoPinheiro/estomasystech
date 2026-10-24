import { ValidationError } from '../shared/errors';

/**
 * Vocabulário do protocolo TIME (Tecido, Infecção/Inflamação, Umidade, Bordas)
 * para avaliação de ferida. Códigos canônicos em inglês (como `ExudateLevel`);
 * os rótulos em pt-BR ficam em `src/lib/format.ts`.
 */

/** Contínuo de infecção da ferida (IWII): do sem sinais à infecção sistêmica. */
export const INFECTION_LEVELS = [
  'none',
  'inflammation',
  'local',
  'spreading',
  'systemic',
] as const;
export type InfectionLevel = (typeof INFECTION_LEVELS)[number];

/** Sinais de infecção/inflamação: locais, de disseminação e sistêmicos. */
export const INFECTION_SIGNS = [
  'erythema',
  'heat',
  'edema',
  'increased_exudate',
  'purulent_exudate',
  'malodor',
  'local_pain',
  'friable_granulation',
  'delayed_healing',
  'biofilm_suspected',
  'spreading_erythema',
  'lymphangitis',
  'lymphadenopathy',
  'fever',
  'malaise',
] as const;
export type InfectionSign = (typeof INFECTION_SIGNS)[number];

/** Bordas da ferida e avanço da epitelização. */
export const WOUND_EDGES = [
  'attached',
  'detached',
  'rolled',
  'macerated',
  'undermined',
  'hyperkeratotic',
  'epithelializing',
] as const;
export type WoundEdge = (typeof WOUND_EDGES)[number];

/** Aspecto do exsudato (a quantidade segue em `ExudateLevel`). */
export const EXUDATE_TYPES = [
  'serous',
  'serosanguineous',
  'sanguineous',
  'purulent',
] as const;
export type ExudateType = (typeof EXUDATE_TYPES)[number];

const MAX_PERCENT = 100;

export interface WoundTimeProps {
  infectionLevel?: string | null;
  /** CSV de InfectionSign. */
  infectionSigns?: string | null;
  woundEdges?: string | null;
  exudateType?: string | null;
  granulationPct?: number | null;
  epithelialPct?: number | null;
  sloughPct?: number | null;
  necroticPct?: number | null;
}

function validateEnum(
  label: string,
  value: string | null | undefined,
  allowed: readonly string[],
): void {
  if (value != null && !allowed.includes(value)) {
    throw new ValidationError(`${label} inválido: ${value}`);
  }
}

function validateSigns(codes: string | null | undefined): void {
  if (!codes?.trim()) {
    return;
  }
  const invalid = codes
    .split(',')
    .map((token) => token.trim())
    .filter((token) => !(INFECTION_SIGNS as readonly string[]).includes(token));
  if (invalid.length > 0) {
    throw new ValidationError(
      `Sinais de infecção inválidos: ${invalid.join(', ')}`,
    );
  }
}

function validateTissuePercents(props: WoundTimeProps): void {
  const values = [
    props.granulationPct,
    props.epithelialPct,
    props.sloughPct,
    props.necroticPct,
  ];
  const informed = values.filter((v): v is number => v != null);
  const inRange = informed.every(
    (v) => Number.isInteger(v) && v >= 0 && v <= MAX_PERCENT,
  );
  if (!inRange) {
    throw new ValidationError(
      `Percentual de tecido deve ser inteiro de 0 a ${MAX_PERCENT}`,
    );
  }
  if (informed.reduce((sum, v) => sum + v, 0) > MAX_PERCENT) {
    throw new ValidationError(
      `A soma dos percentuais de tecido não pode passar de ${MAX_PERCENT}%`,
    );
  }
}

/** Valida os campos do TIME; todos opcionais — avaliação antiga segue válida. */
export function validateWoundTime(props: WoundTimeProps): void {
  validateEnum('Nível de infecção', props.infectionLevel, INFECTION_LEVELS);
  validateEnum('Bordas', props.woundEdges, WOUND_EDGES);
  validateEnum('Tipo de exsudato', props.exudateType, EXUDATE_TYPES);
  validateSigns(props.infectionSigns);
  validateTissuePercents(props);
}

/** Níveis que pedem atenção da equipe: infecção local ou pior (ADR-063). */
const INFECTION_ALERT_LEVELS: readonly string[] = [
  'local',
  'spreading',
  'systemic',
];

/** Infecção local, com disseminação ou sistêmica gera alerta na triagem (ADR-063). */
export function isInfectionAlertLevel(level: string | null | undefined) {
  return level != null && INFECTION_ALERT_LEVELS.includes(level);
}

const LOCAL_SIGNS: readonly string[] = [
  'erythema',
  'heat',
  'edema',
  'increased_exudate',
  'purulent_exudate',
  'malodor',
  'local_pain',
  'friable_granulation',
  'delayed_healing',
  'biofilm_suspected',
];
const SPREADING_SIGNS: readonly string[] = [
  'spreading_erythema',
  'lymphangitis',
  'lymphadenopathy',
];
const SYSTEMIC_SIGNS: readonly string[] = ['fever', 'malaise'];

const LEVEL_RANK: Record<InfectionLevel, number> = {
  none: 0,
  inflammation: 1,
  local: 2,
  spreading: 3,
  systemic: 4,
};

function parseSigns(csv: string | null | undefined): string[] {
  return (csv ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * Avisos de coerência entre o nível de infecção e os sinais marcados. Nunca
 * bloqueia a gravação: a combinação é juízo clínico (ADR-063).
 */
export function infectionCoherenceWarnings(
  level: string | null | undefined,
  signsCsv: string | null | undefined,
): string[] {
  if (!level || !(level in LEVEL_RANK)) {
    return [];
  }
  const rank = LEVEL_RANK[level as InfectionLevel];
  const signs = parseSigns(signsCsv);
  const has = (group: readonly string[]) =>
    signs.some((sign) => group.includes(sign));
  const anyInfectionSign =
    has(LOCAL_SIGNS) || has(SPREADING_SIGNS) || has(SYSTEMIC_SIGNS);
  const rules: Array<[boolean, string]> = [
    [
      rank === 0 && signs.length > 0,
      'Há sinais marcados, mas o nível é «sem sinais de infecção».',
    ],
    [
      rank >= 2 && !anyInfectionSign,
      'O nível indica infecção, mas nenhum sinal foi marcado.',
    ],
    [
      rank < 3 && has(SPREADING_SIGNS),
      'Há sinais de disseminação; confira se o nível não deveria ser «infecção com disseminação» ou pior.',
    ],
    [
      rank < 4 && has(SYSTEMIC_SIGNS),
      'Há sinais sistêmicos (febre ou mal-estar); confira se o nível não deveria ser «infecção sistêmica».',
    ],
  ];
  return rules.filter(([applies]) => applies).map(([, message]) => message);
}
