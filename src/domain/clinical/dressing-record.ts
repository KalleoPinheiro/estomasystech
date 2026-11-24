import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';

/**
 * Registro do curativo em etapas (#963, T1): o que foi feito no curativo de uma
 * consulta, etapa por etapa (aceleradores § 2.1, P2-10). Imutável depois de
 * salvo, como a evolução: corrigir é registrar outro (D4). Os itens do estoque
 * usados em cada etapa entram com o registro (T2); laser (T3) e a baixa (T5)
 * chegam em tickets próprios.
 *
 * Decisões conservadoras enquanto a clínica não define (plano da #963):
 * - D3: só a cobertura primária e a próxima troca são obrigatórias;
 * - D7: a ferida é opcional e a consulta pode ter mais de um registro;
 * - D8: limpeza, desbridamento e terapia adjuvante são texto livre;
 * - D5 (coordenador, 2026-11-24): laser com comprimento de onda em número livre
 *   (nm) por região, PDT e ILIB como sim/não.
 */

export const DRESSING_TEXT_MAX = 1000;
export const PAIN_MIN = 0;
export const PAIN_MAX = 10;

export const PRIMARY_COVER_REQUIRED_MESSAGE =
  'Informe a cobertura primária do curativo.';
export const NEXT_CHANGE_REQUIRED_MESSAGE =
  'Informe a data da próxima troca do curativo.';
export const NEXT_CHANGE_INVALID_MESSAGE =
  'A próxima troca precisa ser uma data válida (AAAA-MM-DD).';
export const PAIN_INVALID_MESSAGE = `A dor vai de ${PAIN_MIN} a ${PAIN_MAX}, em número inteiro.`;
export const DRESSING_TEXT_TOO_LONG_MESSAGE = `Cada etapa do curativo tem no máximo ${DRESSING_TEXT_MAX} caracteres.`;

/** Regiões da ferida onde o laser é aplicado (T3). */
export const LASER_REGIONS = ['bed', 'edge', 'periwound'] as const;
export type LaserRegionKey = (typeof LASER_REGIONS)[number];

export const LASER_REGION_LABELS: Record<LaserRegionKey, string> = {
  bed: 'Leito',
  edge: 'Borda',
  periwound: 'Periferia',
};

/** Limites de digitação, não regra clínica: só barram número absurdo. */
export const LASER_WAVELENGTH_MAX = 10_000;
export const LASER_JOULES_MAX = 1000;
export const LASER_POINTS_MAX = 1000;

export const LASER_WAVELENGTH_INVALID_MESSAGE = `O comprimento de onda do laser é um número inteiro de 1 a ${LASER_WAVELENGTH_MAX} nm.`;
export const LASER_JOULES_INVALID_MESSAGE = `A energia por ponto do laser é um número maior que zero, até ${LASER_JOULES_MAX} J.`;
export const LASER_POINTS_INVALID_MESSAGE = `O número de pontos do laser é um inteiro de 1 a ${LASER_POINTS_MAX}.`;

/** Parâmetros do laser numa região; cada um é opcional. */
export interface LaserRegion {
  wavelengthNm: number | null;
  joulesPerPoint: number | null;
  points: number | null;
}

/** Laser do curativo (T3): por região, mais PDT e ILIB como sim/não (D5). */
export interface DressingLaser {
  bed: LaserRegion | null;
  edge: LaserRegion | null;
  periwound: LaserRegion | null;
  pdt: boolean;
  ilib: boolean;
}

/** Etapas do curativo que usam insumo do estoque, na ordem do curativo. */
export const DRESSING_ITEM_ROLES = [
  'solucao',
  'protecao',
  'cobertura_primaria',
  'cobertura_secundaria',
  'fixacao',
] as const;
export type DressingItemRole = (typeof DRESSING_ITEM_ROLES)[number];

export const DRESSING_ITEM_ROLE_LABELS: Record<DressingItemRole, string> = {
  solucao: 'Solução de limpeza',
  protecao: 'Proteção perilesional',
  cobertura_primaria: 'Cobertura primária',
  cobertura_secundaria: 'Cobertura secundária',
  fixacao: 'Fixação',
};

export const DRESSING_ITEMS_MAX = 30;
/** Maior inteiro que a coluna `integer` do Postgres guarda. */
export const DRESSING_ITEM_QUANTITY_MAX = 2_147_483_647;

export const DRESSING_ITEM_ROLE_INVALID_MESSAGE =
  'Etapa do item do curativo inválida.';
export const DRESSING_ITEM_SUPPLY_REQUIRED_MESSAGE =
  'Informe o insumo usado no curativo.';
export const DRESSING_ITEM_QUANTITY_INVALID_MESSAGE =
  'A quantidade do insumo usado precisa ser um número inteiro maior que zero.';
export const DRESSING_ITEM_DUPLICATE_MESSAGE =
  'O mesmo insumo aparece duas vezes na mesma etapa do curativo.';
export const DRESSING_ITEMS_TOO_MANY_MESSAGE = `O curativo tem no máximo ${DRESSING_ITEMS_MAX} itens.`;

/** Insumo do estoque usado numa etapa do curativo (T2). A baixa vem no T5. */
export interface DressingItem {
  role: DressingItemRole;
  supplyId: string;
  quantity: number;
}

/** Etapas do curativo, na ordem em que acontecem. Texto em branco vira `null`. */
export interface DressingContent {
  /** Dor antes do curativo, de 0 a 10. */
  painBefore: number | null;
  /** Remoção da cobertura anterior. */
  removal: string | null;
  cleansingMethod: string | null;
  cleansingSolution: string | null;
  debridementType: string | null;
  debridementResult: string | null;
  adjuvantTherapy: string | null;
  periwoundProtection: string | null;
  primaryCover: string;
  secondaryCover: string | null;
  fixation: string | null;
  guidance: string | null;
  /** Dor depois do curativo, de 0 a 10. */
  painAfter: number | null;
  /** Data civil da próxima troca (AAAA-MM-DD). */
  nextChangeOn: string;
  /** Laser e terapias de luz (T3); ausente quando não houve. */
  laser?: DressingLaser | null;
}

export interface DressingRecordProps {
  patientId: string;
  appointmentId: string;
  /** Ferida tratada; opcional enquanto a clínica não decide (D7). */
  conditionId?: string | null;
  /** Quem registrou (profissional da sessão), quando houver. */
  professionalId?: string | null;
  content: DressingContent;
  /** Insumos usados, por etapa; sem item é um curativo sem estoque registrado. */
  items?: readonly DressingItem[];
}

export interface DressingRecordState
  extends Omit<DressingRecordProps, 'content' | 'items'> {
  id: string;
  createdAt: Date;
  /** Ausente equivale a nenhum item (registro anterior ao T2). */
  items?: readonly DressingItem[];
  /** `null` depois da anonimização por retenção: o registro fica, o conteúdo não. */
  content: DressingContent | null;
}

const TEXT_FIELDS = [
  'removal',
  'cleansingMethod',
  'cleansingSolution',
  'debridementType',
  'debridementResult',
  'adjuvantTherapy',
  'periwoundProtection',
  'secondaryCover',
  'fixation',
  'guidance',
] as const;

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const required = (value: string, message: string): void => {
  if (value.trim().length === 0) throw new ValidationError(message);
};

/** Texto em branco vira `null`; acima do limite, recusa. */
function normalizeText(value: string | null): string | null {
  const text = value?.trim() ?? '';
  if (text.length > DRESSING_TEXT_MAX) {
    throw new ValidationError(DRESSING_TEXT_TOO_LONG_MESSAGE);
  }
  return text.length === 0 ? null : text;
}

function normalizePain(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < PAIN_MIN || value > PAIN_MAX) {
    throw new ValidationError(PAIN_INVALID_MESSAGE);
  }
  return value;
}

/** Data civil existente no calendário (rejeita 2026-02-30). */
function normalizeCivilDate(value: string): string {
  const text = value.trim();
  if (text.length === 0)
    throw new ValidationError(NEXT_CHANGE_REQUIRED_MESSAGE);
  const match = CIVIL_DATE.exec(text);
  if (!match) throw new ValidationError(NEXT_CHANGE_INVALID_MESSAGE);
  const [year, month, day] = [match[1], match[2], match[3]].map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const exists =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!exists) throw new ValidationError(NEXT_CHANGE_INVALID_MESSAGE);
  return text;
}

function checkNumber(
  value: number | null,
  valid: (value: number) => boolean,
  message: string,
): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || !valid(value)) {
    throw new ValidationError(message);
  }
  return value;
}

const isIntegerUpTo = (max: number) => (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= max;

/** Região sem nenhum parâmetro vira `null`. */
function normalizeLaserRegion(region: LaserRegion | null): LaserRegion | null {
  if (region === null) return null;
  const normalized: LaserRegion = {
    wavelengthNm: checkNumber(
      region.wavelengthNm,
      isIntegerUpTo(LASER_WAVELENGTH_MAX),
      LASER_WAVELENGTH_INVALID_MESSAGE,
    ),
    joulesPerPoint: checkNumber(
      region.joulesPerPoint,
      (value) => value > 0 && value <= LASER_JOULES_MAX,
      LASER_JOULES_INVALID_MESSAGE,
    ),
    points: checkNumber(
      region.points,
      isIntegerUpTo(LASER_POINTS_MAX),
      LASER_POINTS_INVALID_MESSAGE,
    ),
  };
  const empty = Object.values(normalized).every((value) => value === null);
  return empty ? null : normalized;
}

/** Sem região, sem PDT e sem ILIB, o laser some do registro. */
function normalizeLaser(laser: DressingLaser | null | undefined): {
  laser?: DressingLaser;
} {
  if (!laser) return {};
  const regions = Object.fromEntries(
    LASER_REGIONS.map((key) => [key, normalizeLaserRegion(laser[key])]),
  ) as Pick<DressingLaser, LaserRegionKey>;
  const pdt = laser.pdt === true;
  const ilib = laser.ilib === true;
  const anyRegion = LASER_REGIONS.some((key) => regions[key] !== null);
  if (!anyRegion && !pdt && !ilib) return {};
  return { laser: { ...regions, pdt, ilib } };
}

function normalizeContent(content: DressingContent): DressingContent {
  const primaryCover = normalizeText(content.primaryCover);
  if (primaryCover === null) {
    throw new ValidationError(PRIMARY_COVER_REQUIRED_MESSAGE);
  }
  const texts = Object.fromEntries(
    TEXT_FIELDS.map((field) => [field, normalizeText(content[field])]),
  ) as Pick<DressingContent, (typeof TEXT_FIELDS)[number]>;
  return {
    painBefore: normalizePain(content.painBefore),
    ...texts,
    primaryCover,
    painAfter: normalizePain(content.painAfter),
    nextChangeOn: normalizeCivilDate(content.nextChangeOn),
    ...normalizeLaser(content.laser),
  };
}

const isItemRole = (value: string): value is DressingItemRole =>
  (DRESSING_ITEM_ROLES as readonly string[]).includes(value);

function normalizeItem(item: DressingItem): DressingItem {
  if (!isItemRole(item.role)) {
    throw new ValidationError(DRESSING_ITEM_ROLE_INVALID_MESSAGE);
  }
  const supplyId = item.supplyId.trim();
  if (supplyId.length === 0) {
    throw new ValidationError(DRESSING_ITEM_SUPPLY_REQUIRED_MESSAGE);
  }
  if (
    !Number.isInteger(item.quantity) ||
    item.quantity <= 0 ||
    item.quantity > DRESSING_ITEM_QUANTITY_MAX
  ) {
    throw new ValidationError(DRESSING_ITEM_QUANTITY_INVALID_MESSAGE);
  }
  return Object.freeze({ role: item.role, supplyId, quantity: item.quantity });
}

/** Itens na ordem recebida; o mesmo insumo duas vezes na mesma etapa é recusado. */
function normalizeItems(
  items: readonly DressingItem[],
): readonly DressingItem[] {
  if (items.length > DRESSING_ITEMS_MAX) {
    throw new ValidationError(DRESSING_ITEMS_TOO_MANY_MESSAGE);
  }
  const normalized = items.map(normalizeItem);
  const keys = new Set(normalized.map((i) => `${i.role}:${i.supplyId}`));
  if (keys.size !== normalized.length) {
    throw new ValidationError(DRESSING_ITEM_DUPLICATE_MESSAGE);
  }
  return Object.freeze(normalized);
}

/** Cópia congelada: quem restaurou ou leu não altera o item guardado. */
const frozenItems = (items: readonly DressingItem[]): readonly DressingItem[] =>
  Object.freeze(items.map((item) => Object.freeze({ ...item })));

export class DressingRecord {
  private constructor(
    private readonly state: DressingRecordState & {
      items: readonly DressingItem[];
    },
  ) {}

  static create(props: DressingRecordProps): DressingRecord {
    required(props.patientId, 'Paciente é obrigatório');
    required(props.appointmentId, 'Consulta é obrigatória');
    return new DressingRecord({
      patientId: props.patientId,
      appointmentId: props.appointmentId,
      conditionId: props.conditionId?.trim() || null,
      professionalId: props.professionalId?.trim() || null,
      content: normalizeContent(props.content),
      items: normalizeItems(props.items ?? []),
      id: newId(),
      createdAt: new Date(),
    });
  }

  static restore(state: DressingRecordState): DressingRecord {
    return new DressingRecord({
      ...state,
      items: frozenItems(state.items ?? []),
    });
  }

  get id(): string {
    return this.state.id;
  }

  get patientId(): string {
    return this.state.patientId;
  }

  get appointmentId(): string {
    return this.state.appointmentId;
  }

  get conditionId(): string | null {
    return this.state.conditionId ?? null;
  }

  get professionalId(): string | null {
    return this.state.professionalId ?? null;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get content(): DressingContent | null {
    return this.state.content;
  }

  get items(): readonly DressingItem[] {
    return this.state.items;
  }
}
