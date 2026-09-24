import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  businessDay,
  MAX_SLOT_DURATION_MINUTES,
  SLOT_SEEDS,
  type SlotSeed,
  slotFromSeed,
  WEEKLY_SERIES_SEEDS,
  WEEKLY_SERIES_SESSIONS,
  type YMD,
  ymdToDateInput,
} from '../../e2e/support/slots';

/**
 * Prova que as seeds de horário do E2E nunca colidem entre si (o conflito de
 * agenda é global e exige 15 min de folga) nem saem da grade 08:00–18:00, para
 * qualquer dia da semana de "hoje". O tipo `SlotSeed` já obriga toda seed usada
 * em `e2e/` a estar em `SLOT_SEEDS`; aqui cobrimos a lista inteira.
 */

const MIN_GAP_MINUTES = 15;
const OPEN_MINUTES = 8 * 60;
const CLOSE_MINUTES = 18 * 60;
/** `retries` de `playwright.config.ts` — tentativas 0 e 1 coexistem no banco. */
const PLAYWRIGHT_RETRIES = 1;
/** Segunda 2026-09-21 a domingo 2026-09-27: os 7 dias da semana possíveis. */
const TODAYS = Array.from(
  { length: 7 },
  (_, i) => new Date(Date.UTC(2026, 8, 21 + i, 12)),
);

interface Booking {
  label: string;
  date: string;
  start: number;
  end: number;
}

function addDays(ymd: YMD, days: number): string {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return d.toISOString().slice(0, 10);
}

function seedBookings(seed: SlotSeed, attempt: number, today: Date): Booking[] {
  const slot = slotFromSeed(seed, {
    attempt,
    today,
    durationMinutes: MAX_SLOT_DURATION_MINUTES,
  });
  const start = slot.hour * 60 + slot.minute;
  const sessions = (WEEKLY_SERIES_SEEDS as readonly string[]).includes(seed)
    ? WEEKLY_SERIES_SESSIONS
    : 1;
  return Array.from({ length: sessions }, (_, week) => ({
    label: `${seed}#${attempt}${week > 0 ? ` (semana ${week + 1})` : ''}`,
    date: addDays(slot.ymd, week * 7),
    start,
    end: start + MAX_SLOT_DURATION_MINUTES,
  }));
}

/** Consultas criadas fora de `slotFromSeed` que dividem o banco com as seeds. */
function fixedBookings(today: Date): Booking[] {
  // agenda.spec.ts › "grade de horários é configurável": 10:30 em businessDay(10).
  return [
    {
      label: 'agenda-grade-custom 10:30',
      date: ymdToDateInput(businessDay(10, today)),
      start: 10 * 60 + 30,
      end: 11 * 60 + 30,
    },
  ];
}

function allBookings(today: Date): Booking[] {
  const bookings = fixedBookings(today);
  for (let attempt = 0; attempt <= PLAYWRIGHT_RETRIES; attempt++) {
    for (const seed of SLOT_SEEDS) {
      bookings.push(...seedBookings(seed, attempt, today));
    }
  }
  return bookings;
}

function collisions(bookings: Booking[]): string[] {
  const found: string[] = [];
  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const a = bookings[i];
      const b = bookings[j];
      const apart =
        a.end + MIN_GAP_MINUTES <= b.start ||
        b.end + MIN_GAP_MINUTES <= a.start;
      if (a.date === b.date && !apart) {
        found.push(`${a.label} × ${b.label} em ${a.date}`);
      }
    }
  }
  return found;
}

describe.each(TODAYS.map((today) => [today.toUTCString().slice(0, 3), today]))(
  'slots do E2E com hoje = %s',
  (_weekday, today) => {
    const bookings = allBookings(today as Date);

    it('nenhuma consulta fica a menos de 15 min de outra', () => {
      expect(collisions(bookings)).toEqual([]);
    });

    it('toda consulta cai em dia útil, dentro de 08:00–18:00 e depois de hoje', () => {
      const todayIso = (today as Date).toISOString().slice(0, 10);
      for (const b of bookings) {
        const weekday = new Date(`${b.date}T12:00:00Z`).getUTCDay();
        expect(weekday, b.label).not.toBe(0);
        expect(weekday, b.label).not.toBe(6);
        expect(b.start, b.label).toBeGreaterThanOrEqual(OPEN_MINUTES);
        expect(b.end, b.label).toBeLessThanOrEqual(CLOSE_MINUTES);
        expect(b.date > todayIso, b.label).toBe(true);
      }
    });
  },
);

describe('slotFromSeed', () => {
  it('limita o início para terminar até 18:00 e recusa duração acima do máximo', () => {
    for (const seed of SLOT_SEEDS) {
      const slot = slotFromSeed(seed, {
        durationMinutes: MAX_SLOT_DURATION_MINUTES,
      });
      const [endHour, endMinute] = slot.endsAt
        .slice(11, 16)
        .split(':')
        .map(Number);
      expect(endHour * 60 + endMinute, seed).toBeLessThanOrEqual(CLOSE_MINUTES);
    }
    expect(() =>
      slotFromSeed('agenda-conflict', {
        durationMinutes: MAX_SLOT_DURATION_MINUTES + 1,
      }),
    ).toThrow(RangeError);
  });

  it('SLOT_SEEDS não tem duplicatas nem seeds que nenhum spec usa', () => {
    expect(new Set(SLOT_SEEDS).size).toBe(SLOT_SEEDS.length);
    const e2eDir = path.join(process.cwd(), 'e2e');
    const specs = readdirSync(e2eDir)
      .filter((file) => file.endsWith('.spec.ts'))
      .map((file) => readFileSync(path.join(e2eDir, file), 'utf8'))
      .join('\n');
    const unused = SLOT_SEEDS.filter((seed) => !specs.includes(`"${seed}"`));
    expect(unused).toEqual([]);
  });
});
