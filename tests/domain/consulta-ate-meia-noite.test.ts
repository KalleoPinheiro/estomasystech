import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertWithinBusinessHours,
  endMinuteOfDay,
} from '@/domain/scheduling/business-hours';
import { assertWithinProfessionalHours } from '@/domain/scheduling/schedule-availability';
import { DEFAULT_SCHEDULE_CONFIG } from '@/domain/scheduling/schedule-config';
import { ValidationError } from '@/domain/shared/errors';
import { TimeSlot } from '@/domain/shared/time-slot';
import { zonedParts } from '@/domain/shared/time-zone';

const SAO_PAULO = 'America/Sao_Paulo';
// Terça 2027-06-08, horário de parede de São Paulo (-03:00, sem horário de verão).
const slot = (start: string, end: string) =>
  TimeSlot.create(new Date(`${start}-03:00`), new Date(`${end}-03:00`));

const allDay = {
  ...DEFAULT_SCHEDULE_CONFIG,
  startHour: 0,
  endHour: 24,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  lunchBreak: null,
};
const windows = [{ weekday: 2, startMinute: 0, endMinute: 1440 }];

const businessHours = (s: TimeSlot) =>
  assertWithinBusinessHours(s, allDay, SAO_PAULO);
const professionalHours = (s: TimeSlot) =>
  assertWithinProfessionalHours(s, windows, SAO_PAULO);

describe.each([
  ['grade da clínica', businessHours],
  ['janela do profissional', professionalHours],
])(
  'Feature: consulta que termina à meia-noite — %s (#580)',
  (_name, assertSlot) => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('Dada a grade 00–24 h, Quando a consulta é 23:00–24:00 (fim às 00:00 do dia seguinte), Então é aceita', () => {
      expect(() =>
        assertSlot(slot('2027-06-08T23:00:00', '2027-06-09T00:00:00')),
      ).not.toThrow();
    });

    it('Dada a grade 00–24 h, Quando a consulta é 23:30–00:00, Então é aceita', () => {
      expect(() =>
        assertSlot(slot('2027-06-08T23:30:00', '2027-06-09T00:00:00')),
      ).not.toThrow();
    });

    it('Dada a grade 00–24 h, Quando a consulta é 23:30–00:30, Então é recusada (cruza a meia-noite)', () => {
      expect(() =>
        assertSlot(slot('2027-06-08T23:30:00', '2027-06-09T00:30:00')),
      ).toThrow(ValidationError);
    });

    it('Dada a grade 00–24 h, Quando o fim é 00:00 mas dois dias depois, Então é recusada', () => {
      expect(() =>
        assertSlot(slot('2027-06-08T23:00:00', '2027-06-10T00:00:00')),
      ).toThrow(ValidationError);
    });

    it('Dado o fuso da clínica (APP_TIMEZONE), Quando o processo roda em outro fuso, Então 23:00–24:00 de São Paulo é aceita', () => {
      vi.stubEnv('APP_TIMEZONE', SAO_PAULO);
      const s = slot('2027-06-08T23:00:00', '2027-06-09T00:00:00');
      expect(() =>
        assertSlot === businessHours
          ? assertWithinBusinessHours(s, allDay)
          : assertWithinProfessionalHours(s, windows),
      ).not.toThrow();
    });
  },
);

describe('Feature: grade que fecha antes da meia-noite (#580)', () => {
  it('Dada a grade padrão 08–18 h, Quando a consulta termina às 24:00, Então segue recusada', () => {
    expect(() =>
      assertWithinBusinessHours(
        slot('2027-06-08T17:00:00', '2027-06-09T00:00:00'),
        DEFAULT_SCHEDULE_CONFIG,
        SAO_PAULO,
      ),
    ).toThrow(ValidationError);
  });
});

describe('Feature: endMinuteOfDay (#580)', () => {
  const parts = (iso: string) =>
    zonedParts(new Date(`${iso}-03:00`), SAO_PAULO);

  it('Dado fim no mesmo dia, Então devolve o minuto do dia', () => {
    expect(
      endMinuteOfDay(
        parts('2027-06-08T09:00:00'),
        parts('2027-06-08T10:30:00'),
      ),
    ).toBe(630);
  });

  it('Dado fim às 00:00 do dia seguinte, Então devolve 1440', () => {
    expect(
      endMinuteOfDay(
        parts('2027-06-08T23:00:00'),
        parts('2027-06-09T00:00:00'),
      ),
    ).toBe(1440);
  });

  it('Dado fim às 00:00 do dia seguinte na virada de mês e de ano, Então devolve 1440', () => {
    expect(
      endMinuteOfDay(
        parts('2027-12-31T23:00:00'),
        parts('2028-01-01T00:00:00'),
      ),
    ).toBe(1440);
  });

  it('Dado fim depois da meia-noite ou 00:00 de dois dias depois, Então devolve null', () => {
    expect(
      endMinuteOfDay(
        parts('2027-06-08T23:30:00'),
        parts('2027-06-09T00:30:00'),
      ),
    ).toBeNull();
    expect(
      endMinuteOfDay(
        parts('2027-06-08T23:00:00'),
        parts('2027-06-10T00:00:00'),
      ),
    ).toBeNull();
  });
});

describe('Feature: janela do profissional com minutos no início (#580)', () => {
  it('Dada a janela terça 09:00–10:00, Quando a consulta é 09:30–10:00, Então é aceita; 08:30–09:30 é recusada', () => {
    const morning = [{ weekday: 2, startMinute: 540, endMinute: 600 }];
    expect(() =>
      assertWithinProfessionalHours(
        slot('2027-06-08T09:30:00', '2027-06-08T10:00:00'),
        morning,
        SAO_PAULO,
      ),
    ).not.toThrow();
    expect(() =>
      assertWithinProfessionalHours(
        slot('2027-06-08T08:30:00', '2027-06-08T09:30:00'),
        morning,
        SAO_PAULO,
      ),
    ).toThrow(ValidationError);
  });
});
