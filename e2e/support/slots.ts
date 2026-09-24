/**
 * Datas e horários para os specs — sempre em dias úteis (segunda a sexta) e dentro
 * da grade padrão (08:00–18:00, intervalo mínimo de 15min — ver
 * `DEFAULT_SCHEDULE_CONFIG` em `src/domain/scheduling/schedule-config.ts`).
 *
 * Os horários usam offset explícito `-03:00` (América/São Paulo, sem horário de
 * verão atualmente) em vez de `Date` local — assim o slot fica correto no servidor
 * (que roda com `TZ=America/Sao_Paulo`) independentemente do fuso da máquina que
 * executa os testes.
 *
 * Este módulo é puro (sem `@playwright/test`) para o Vitest provar, em
 * `tests/e2e/slots.test.ts`, que nenhuma seed colide com outra.
 */

export interface YMD {
  year: number;
  month: number;
  day: number;
}

function addUtcDays(base: Date, days: number): Date {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const isWeekend = (d: Date): boolean => d.getUTCDay() === 0 || d.getUTCDay() === 6;

const toYmd = (d: Date): YMD => ({
  year: d.getUTCFullYear(),
  month: d.getUTCMonth() + 1,
  day: d.getUTCDate(),
});

/** Próximo dia útil (seg–sex) a partir de hoje + `daysFromToday`. */
export function businessDay(daysFromToday: number, today: Date = new Date()): YMD {
  let d = addUtcDays(today, daysFromToday);
  while (isWeekend(d)) {
    d = addUtcDays(d, 1);
  }
  return toYmd(d);
}

/** Próximo sábado (fim de semana) a partir de hoje + `daysFromToday` — para testar bloqueio. */
export function weekendDay(daysFromToday: number, today: Date = new Date()): YMD {
  let d = addUtcDays(today, daysFromToday);
  while (d.getUTCDay() !== 6) {
    d = addUtcDays(d, 1);
  }
  return toYmd(d);
}

/**
 * `index`-ésimo dia útil (0 = o primeiro) a partir de hoje + `leadDays`. Índices
 * distintos dão datas distintas por construção, seja qual for o dia da semana de
 * hoje — ao contrário de `businessDay(offset)`, que joga sábado e domingo para a
 * mesma segunda-feira.
 */
export function nthBusinessDay(index: number, leadDays: number, today: Date = new Date()): YMD {
  let d = addUtcDays(today, leadDays);
  while (isWeekend(d)) {
    d = addUtcDays(d, 1);
  }
  for (let remaining = index; remaining > 0; ) {
    d = addUtcDays(d, 1);
    if (!isWeekend(d)) remaining--;
  }
  return toYmd(d);
}

const pad = (n: number): string => String(n).padStart(2, "0");

export const ymdToDateInput = ({ year, month, day }: YMD): string =>
  `${year}-${pad(month)}-${pad(day)}`;

/** ISO com offset fixo -03:00 (América/São Paulo). */
export function saoPauloIso(ymd: YMD, hour: number, minute = 0): string {
  return `${ymd.year}-${pad(ymd.month)}-${pad(ymd.day)}T${pad(hour)}:${pad(minute)}:00-03:00`;
}

export interface Slot {
  ymd: YMD;
  hour: number;
  minute: number;
  startsAt: string;
  endsAt: string;
  dateInput: string;
  startTimeInput: string;
}

/**
 * Seeds que criam série semanal (4 sessões no mesmo horário, +7 dias cada). Ficam
 * numa faixa de horário exclusiva: as sessões seguintes caem em dias de outras
 * seeds, mas nunca no mesmo horário.
 */
export const WEEKLY_SERIES_SEEDS = ["agenda-recurring"] as const;
export const WEEKLY_SERIES_SESSIONS = 4;

/**
 * Toda seed usada em `e2e/`. O conflito de agenda é GLOBAL (não por profissional,
 * ver `Appointment#conflictsWith`) e a suíte inteira roda contra o mesmo banco
 * pglite — então cada seed ganha um dia útil só seu, pela posição nesta lista.
 * Seed nova entra aqui (o tipo `SlotSeed` recusa seed fora da lista); a ordem
 * só importa para o dia sorteado, nunca para a ausência de colisão.
 */
export const SLOT_SEEDS = [
  ...WEEKLY_SERIES_SEEDS,
  "agenda-conflict",
  "agenda-happy-path",
  "agenda-outside-hours",
  "agenda-reschedule-original",
  "agenda-reschedule-target",
  "documentos-atestado-1",
  "documentos-atestado-2",
  "export-lgpd-appointment-1",
  "faturamento-complete",
  "faturamento-package-session",
  "inventario-kit-dispensa",
  "layout-agenda-chips",
  "layout-agenda-lista",
  "layout-agenda-ponto-2",
  "layout-documentos-recibo",
  "layout-mobile-first-world",
  "layout-portal-confirmar",
  "layout-tabelas-producao",
  "layout-tabelas-receita",
  "layout-tabelas-repasses-2",
  "portal-paciente-cancel",
  "portal-paciente-confirm",
  "portal-paciente-ownership",
  "portal-parceiro-appointment",
  "portal-responsivo-desktop",
  "portal-responsivo-paciente-375x667-1",
  "portal-responsivo-paciente-390x844-1",
  "portal-responsivo-parceiro-375x667",
  "portal-responsivo-parceiro-390x844",
  "relatorios-margem-2",
  "relatorios-producao",
  "responsive-tables-relatorios",
] as const;

export type SlotSeed = (typeof SLOT_SEEDS)[number];

/** Nunca hoje/amanhã: o primeiro dia útil de seed é hoje + 3 dias ou depois. */
export const SLOT_LEAD_DAYS = 3;
const BUSINESS_OPEN_MINUTES = 8 * 60;
const BUSINESS_CLOSE_MINUTES = 18 * 60;
export const MAX_SLOT_DURATION_MINUTES = 60;

/** Faixa exclusiva das séries semanais: 08:00. */
const WEEKLY_SERIES_START_MINUTES = BUSINESS_OPEN_MINUTES;
/**
 * Faixas das demais seeds: 12:00, 13:30, 15:00, 16:30 (a última termina às 17:30
 * com 60 min). Ficam longe da série das 08:00 e das 10:30 do teste de grade
 * customizada de `agenda.spec.ts`, que agenda em `businessDay(10)` fora deste
 * esquema.
 */
const SINGLE_START_MINUTES = [12 * 60, 13 * 60 + 30, 15 * 60, 16 * 60 + 30] as const;

export interface SlotOptions {
  durationMinutes?: number;
  /**
   * Índice da tentativa do Playwright (`test.info().retry`). A re-tentativa de um
   * teste roda contra o MESMO banco pglite, onde a consulta da tentativa anterior
   * continua marcada — repetir o horário devolveria 409 ("horário indisponível") e
   * a 2ª tentativa falharia por conflito de dado, escondendo o erro original.
   *
   * Cada tentativa desloca o índice do dia útil em `SLOT_SEEDS.length`: por
   * construção, nenhuma tentativa cai no dia de outra seed ou tentativa.
   */
  attempt?: number;
  /** "Hoje" — injetável para o teste de colisão; padrão: agora. */
  today?: Date;
}

function startMinutesFor(seed: SlotSeed, position: number): number {
  if ((WEEKLY_SERIES_SEEDS as readonly string[]).includes(seed)) {
    return WEEKLY_SERIES_START_MINUTES;
  }
  const singleIndex = position - WEEKLY_SERIES_SEEDS.length;
  return SINGLE_START_MINUTES[singleIndex % SINGLE_START_MINUTES.length];
}

function slotAt(ymd: YMD, startMinutes: number, durationMinutes: number): Slot {
  const hour = Math.floor(startMinutes / 60);
  const minute = startMinutes % 60;
  const end = startMinutes + durationMinutes;
  return {
    ymd,
    hour,
    minute,
    startsAt: saoPauloIso(ymd, hour, minute),
    endsAt: saoPauloIso(ymd, Math.floor(end / 60), end % 60),
    dateInput: ymdToDateInput(ymd),
    startTimeInput: `${pad(hour)}:${pad(minute)}`,
  };
}

/**
 * Slot determinístico da seed: um dia útil exclusivo (posição em `SLOT_SEEDS` +
 * tentativa) e um início que sempre cabe na grade (`início + duração ≤ 18:00`).
 */
export function slotFromSeed(seed: SlotSeed, options: SlotOptions = {}): Slot {
  const { durationMinutes = 60, attempt = 0, today = new Date() } = options;
  if (durationMinutes <= 0 || durationMinutes > MAX_SLOT_DURATION_MINUTES) {
    throw new RangeError(
      `durationMinutes deve estar em 1..${MAX_SLOT_DURATION_MINUTES} (recebido ${durationMinutes})`,
    );
  }
  const position = SLOT_SEEDS.indexOf(seed);
  if (position < 0) {
    throw new Error(`Seed de horário desconhecida: "${seed}" — registre em SLOT_SEEDS`);
  }
  const dayIndex = position + attempt * SLOT_SEEDS.length;
  const ymd = nthBusinessDay(dayIndex, SLOT_LEAD_DAYS, today);
  const start = Math.min(startMinutesFor(seed, position), BUSINESS_CLOSE_MINUTES - durationMinutes);
  return slotAt(ymd, start, durationMinutes);
}

/** Horário fora da grade (19h) no mesmo dia útil da seed — para testar bloqueio. */
export function outsideBusinessHoursSlot(seed: SlotSeed, today: Date = new Date()): Slot {
  const base = slotFromSeed(seed, { today });
  return {
    ...base,
    hour: 19,
    minute: 0,
    startsAt: saoPauloIso(base.ymd, 19, 0),
    endsAt: saoPauloIso(base.ymd, 20, 0),
    startTimeInput: "19:00",
  };
}
