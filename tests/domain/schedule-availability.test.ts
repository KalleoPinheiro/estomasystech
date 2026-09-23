import { describe, expect, it } from 'vitest';
import { assertWithinBusinessHours } from '@/domain/scheduling/business-hours';
import {
  assertNotClosed,
  assertWithinProfessionalHours,
  closureCovers,
  createScheduleClosure,
  describeWeeklyWindows,
  formatDateKey,
  localDateKey,
  validateWeeklyWindows,
} from '@/domain/scheduling/schedule-availability';
import {
  DEFAULT_SCHEDULE_CONFIG,
  describeSchedule,
  validateScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { fromTimeInput, toTimeInput } from '@/domain/scheduling/time-of-day';
import { ValidationError } from '@/domain/shared/errors';
import { TimeSlot } from '@/domain/shared/time-slot';

// Testes rodam com TZ=UTC; 2026-07-20 é segunda-feira.
const slot = (start: string, end: string) =>
  TimeSlot.create(new Date(start), new Date(end));

describe('Feature: Pausa de almoço da clínica', () => {
  const withLunch = validateScheduleConfig({
    ...DEFAULT_SCHEDULE_CONFIG,
    lunchBreak: { startMinute: 720, endMinute: 780 },
  });

  it('Dado pausa 12:00–13:00, Quando o horário invade a pausa, Então ValidationError com a pausa na mensagem', () => {
    expect(() =>
      assertWithinBusinessHours(
        slot('2026-07-20T11:30:00Z', '2026-07-20T12:30:00Z'),
        withLunch,
      ),
    ).toThrow('pausa das 12:00 às 13:00');
  });

  it('Dado pausa 12:00–13:00, Quando o horário encosta na pausa (11:00–12:00 e 13:00–14:00), Então aceita', () => {
    expect(() =>
      assertWithinBusinessHours(
        slot('2026-07-20T11:00:00Z', '2026-07-20T12:00:00Z'),
        withLunch,
      ),
    ).not.toThrow();
    expect(() =>
      assertWithinBusinessHours(
        slot('2026-07-20T13:00:00Z', '2026-07-20T14:00:00Z'),
        withLunch,
      ),
    ).not.toThrow();
  });

  it('Dado horário que engloba a pausa inteira, Então rejeita', () => {
    expect(() =>
      assertWithinBusinessHours(
        slot('2026-07-20T11:00:00Z', '2026-07-20T14:00:00Z'),
        withLunch,
      ),
    ).toThrow(ValidationError);
  });

  it.each([
    ['fim antes do início', { startMinute: 780, endMinute: 720 }],
    ['começando na abertura', { startMinute: 480, endMinute: 540 }],
    ['terminando no fechamento', { startMinute: 1020, endMinute: 1080 }],
    ['minuto não inteiro', { startMinute: 720.5, endMinute: 780 }],
  ])(
    'Dado pausa inválida (%s), Quando validar, Então ValidationError',
    (_, lunchBreak) => {
      expect(() =>
        validateScheduleConfig({ ...DEFAULT_SCHEDULE_CONFIG, lunchBreak }),
      ).toThrow(ValidationError);
    },
  );

  it('Dado grade sem pausa, Então descrição não cita pausa e a config normaliza para null', () => {
    const config = validateScheduleConfig({
      weekdays: [1],
      startHour: 8,
      endHour: 18,
      minGapMinutes: 15,
    });
    expect(config.lunchBreak).toBeNull();
    expect(describeSchedule(config)).not.toContain('pausa');
  });

  it('Minutos ↔ HH:MM ida e volta; valor inválido vira 0', () => {
    expect(toTimeInput(750)).toBe('12:30');
    expect(fromTimeInput('12:30')).toBe(750);
    expect(fromTimeInput('')).toBe(0);
  });
});

describe('Feature: Feriados, recessos e ausências', () => {
  const now = new Date('2026-07-01T10:00:00Z');

  it('Dado só a data inicial, Quando criar, Então o bloqueio vale para um dia e o motivo é aparado', () => {
    const closure = createScheduleClosure(
      { startsOn: '2026-12-25', reason: '  Natal ' },
      now,
    );
    expect(closure).toMatchObject({
      professionalId: null,
      startsOn: '2026-12-25',
      endsOn: '2026-12-25',
      reason: 'Natal',
      createdAt: now,
    });
    expect(closure.id).toBeTruthy();
  });

  it.each([
    ['data inexistente', { startsOn: '2026-02-30', reason: 'x' }],
    ['formato errado', { startsOn: '25/12/2026', reason: 'x' }],
    [
      'fim antes do início',
      { startsOn: '2026-12-25', endsOn: '2026-12-24', reason: 'x' },
    ],
    ['motivo vazio', { startsOn: '2026-12-25', reason: '   ' }],
    ['motivo longo', { startsOn: '2026-12-25', reason: 'x'.repeat(201) }],
    [
      'mais de 366 dias',
      { startsOn: '2026-01-01', endsOn: '2027-01-02', reason: 'x' },
    ],
  ])('Dado %s, Quando criar, Então ValidationError', (_, input) => {
    expect(() => createScheduleClosure(input)).toThrow(ValidationError);
  });

  it('Dado bloqueio de 366 dias, Quando criar, Então aceita (limite inclusivo)', () => {
    expect(() =>
      createScheduleClosure({
        startsOn: '2026-01-01',
        endsOn: '2027-01-01',
        reason: 'Reforma',
      }),
    ).not.toThrow();
  });

  it('Dado período, Então cobre as pontas e nada fora delas', () => {
    const closure = createScheduleClosure({
      startsOn: '2026-12-24',
      endsOn: '2026-12-26',
      reason: 'Recesso',
    });
    expect(closureCovers(closure, '2026-12-24')).toBe(true);
    expect(closureCovers(closure, '2026-12-26')).toBe(true);
    expect(closureCovers(closure, '2026-12-23')).toBe(false);
    expect(closureCovers(closure, '2026-12-27')).toBe(false);
  });

  const christmas = slot('2026-12-25T10:00:00Z', '2026-12-25T11:00:00Z');

  it('Dado feriado da clínica, Quando agendar com ou sem profissional, Então rejeita com o motivo', () => {
    const closures = [
      createScheduleClosure({ startsOn: '2026-12-25', reason: 'Natal' }),
    ];
    expect(() => assertNotClosed(christmas, closures, null)).toThrow(
      'Clínica fechada em 25/12/2026: Natal',
    );
    expect(() => assertNotClosed(christmas, closures, 'prof-1')).toThrow(
      ValidationError,
    );
  });

  it('Dado ausência de um profissional, Então bloqueia só as consultas dele', () => {
    const closures = [
      createScheduleClosure({
        professionalId: 'prof-1',
        startsOn: '2026-12-25',
        reason: 'Férias',
      }),
    ];
    expect(() => assertNotClosed(christmas, closures, 'prof-1')).toThrow(
      'Profissional ausente em 25/12/2026: Férias',
    );
    expect(() => assertNotClosed(christmas, closures, 'prof-2')).not.toThrow();
    expect(() => assertNotClosed(christmas, closures, null)).not.toThrow();
  });

  it('Datas locais: chave e formatação', () => {
    expect(localDateKey(new Date('2026-03-05T10:00:00Z'))).toBe('2026-03-05');
    expect(formatDateKey('2026-03-05')).toBe('05/03/2026');
  });
});

describe('Feature: Horário semanal do profissional', () => {
  const windows = validateWeeklyWindows([
    { weekday: 3, startMinute: 780, endMinute: 1080 },
    { weekday: 1, startMinute: 480, endMinute: 720 },
  ]);

  it('Dado janelas fora de ordem, Quando validar, Então ordena por dia e início', () => {
    expect(windows.map((w) => w.weekday)).toEqual([1, 3]);
    expect(describeWeeklyWindows(windows)).toBe(
      'segunda 08:00–12:00, quarta 13:00–18:00',
    );
  });

  it.each([
    ['dia 7', [{ weekday: 7, startMinute: 480, endMinute: 600 }]],
    [
      'início depois do fim',
      [{ weekday: 1, startMinute: 600, endMinute: 480 }],
    ],
    ['passa de 24:00', [{ weekday: 1, startMinute: 480, endMinute: 1441 }]],
    [
      'janelas sobrepostas no mesmo dia',
      [
        { weekday: 1, startMinute: 480, endMinute: 720 },
        { weekday: 1, startMinute: 700, endMinute: 900 },
      ],
    ],
  ])('Dado %s, Quando validar, Então ValidationError', (_, input) => {
    expect(() => validateWeeklyWindows(input)).toThrow(ValidationError);
  });

  it('Dado janelas encostadas no mesmo dia, Quando validar, Então aceita', () => {
    expect(
      validateWeeklyWindows([
        { weekday: 1, startMinute: 480, endMinute: 720 },
        { weekday: 1, startMinute: 720, endMinute: 900 },
      ]),
    ).toHaveLength(2);
  });

  it('Dado horário dentro da janela da segunda, Então aceita; na terça (sem janela) ou passando do fim, rejeita', () => {
    expect(() =>
      assertWithinProfessionalHours(
        slot('2026-07-20T09:00:00Z', '2026-07-20T12:00:00Z'),
        windows,
      ),
    ).not.toThrow();
    expect(() =>
      assertWithinProfessionalHours(
        slot('2026-07-21T09:00:00Z', '2026-07-21T10:00:00Z'),
        windows,
      ),
    ).toThrow('Fora do horário do profissional: segunda 08:00–12:00');
    expect(() =>
      assertWithinProfessionalHours(
        slot('2026-07-20T11:30:00Z', '2026-07-20T12:30:00Z'),
        windows,
      ),
    ).toThrow(ValidationError);
  });

  it('Dado janela até 24:00, Quando o horário termina à meia-noite, Então aceita', () => {
    expect(() =>
      assertWithinProfessionalHours(
        slot('2026-07-20T23:00:00Z', '2026-07-21T00:00:00Z'),
        [{ weekday: 1, startMinute: 1320, endMinute: 1440 }],
      ),
    ).not.toThrow();
  });

  it('Dado profissional sem janelas, Então qualquer horário passa (segue a clínica)', () => {
    expect(() =>
      assertWithinProfessionalHours(
        slot('2026-07-21T09:00:00Z', '2026-07-21T10:00:00Z'),
        [],
      ),
    ).not.toThrow();
  });
});
