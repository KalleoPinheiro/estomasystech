import { describe, expect, it } from 'vitest';
import {
  describeSchedule,
  type ScheduleConfig,
  validateCancellationPolicy,
  validateScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { ValidationError } from '@/domain/shared/errors';

const config = (overrides: Partial<ScheduleConfig> = {}): ScheduleConfig => ({
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
  minGapMinutes: 15,
  ...overrides,
});

describe('Feature: Configuração da agenda (mutação, #406)', () => {
  describe('Cenário: dias da semana', () => {
    it('Dado dias repetidos e fora de ordem, Então normaliza em ordem crescente e sem repetição', () => {
      expect(
        validateScheduleConfig(config({ weekdays: [5, 1, 3, 1, 0] })).weekdays,
      ).toEqual([0, 1, 3, 5]);
    });

    it('Dado nenhum dia ou dia inválido, Então rejeita com a mensagem', () => {
      for (const weekdays of [[], [7], [-1], [1.5], [1, 9]]) {
        expect(() => validateScheduleConfig(config({ weekdays }))).toThrow(
          'Selecione ao menos um dia da semana válido',
        );
      }
    });

    it('Dado domingo e sábado, Então aceita os limites 0 e 6', () => {
      expect(
        validateScheduleConfig(config({ weekdays: [0, 6] })).weekdays,
      ).toEqual([0, 6]);
    });
  });

  describe('Cenário: horário de funcionamento', () => {
    it.each([
      [-1, 10],
      [24, 24],
      [8, 25],
      [8, 0],
      [10, 10],
      [12, 8],
      [8.5, 18],
      [8, 18.5],
    ])(
      'Dado abertura %s e fechamento %s, Então rejeita',
      (startHour, endHour) => {
        expect(() =>
          validateScheduleConfig(config({ startHour, endHour })),
        ).toThrow(
          'Horário de funcionamento inválido (abertura antes do fechamento, 0–24h)',
        );
      },
    );

    it('Dado o dia inteiro (0 a 24) e a menor janela (23 a 24), Então aceita', () => {
      expect(() =>
        validateScheduleConfig(config({ startHour: 0, endHour: 24 })),
      ).not.toThrow();
      expect(() =>
        validateScheduleConfig(config({ startHour: 23, endHour: 24 })),
      ).not.toThrow();
      expect(() =>
        validateScheduleConfig(config({ startHour: 8, endHour: 9 })),
      ).not.toThrow();
    });
  });

  describe('Cenário: intervalo entre consultas', () => {
    it.each([14, 121, 20.5])(
      'Dado %s minutos, Então rejeita com a faixa',
      (minGapMinutes) => {
        expect(() => validateScheduleConfig(config({ minGapMinutes }))).toThrow(
          'Intervalo entre consultas deve ser de 15 a 120 minutos',
        );
      },
    );

    it('Dado 15 e 120, Então aceita', () => {
      expect(() =>
        validateScheduleConfig(config({ minGapMinutes: 15 })),
      ).not.toThrow();
      expect(() =>
        validateScheduleConfig(config({ minGapMinutes: 120 })),
      ).not.toThrow();
    });
  });

  describe('Cenário: almoço', () => {
    const lunch = (startMinute: number, endMinute: number) =>
      config({ lunchBreak: { startMinute, endMinute } });

    it('Dado almoço válido dentro do horário, Então mantém só início e fim', () => {
      expect(validateScheduleConfig(lunch(720, 780)).lunchBreak).toEqual({
        startMinute: 720,
        endMinute: 780,
      });
    });

    it.each([
      [780, 720],
      [720, 720],
      [480, 600],
      [400, 600],
      [600, 1080],
      [600, 1100],
      [720.5, 780],
      [720, 780.5],
    ])('Dado almoço de %s a %s minutos, Então rejeita', (start, end) => {
      expect(() => validateScheduleConfig(lunch(start, end))).toThrow(
        'Intervalo de almoço deve começar antes de terminar e ficar dentro do horário de funcionamento',
      );
    });

    it('Dado almoço colado nas bordas do expediente (08:01 a 17:59), Então aceita', () => {
      expect(() => validateScheduleConfig(lunch(481, 1079))).not.toThrow();
    });

    it('Dado sem almoço, Então fica nulo', () => {
      expect(validateScheduleConfig(config()).lunchBreak).toBeNull();
    });
  });

  describe('Cenário: política de cancelamento', () => {
    it('Dado limites válidos, Então aceita 0 e 168 horas e taxa de 0 a 1.000.000', () => {
      expect(
        validateCancellationPolicy({ noticeHours: 0, lateFeeCents: 0 }),
      ).toEqual({ noticeHours: 0, lateFeeCents: 0 });
      expect(
        validateCancellationPolicy({
          noticeHours: 168,
          lateFeeCents: 1_000_000,
        }),
      ).toEqual({
        noticeHours: 168,
        lateFeeCents: 1_000_000,
      });
    });

    it.each([-1, 169, 1.5])(
      'Dado antecedência %s, Então rejeita com a faixa',
      (noticeHours) => {
        expect(() =>
          validateCancellationPolicy({ noticeHours, lateFeeCents: 0 }),
        ).toThrow('Antecedência para cancelar deve ser de 0 a 168 horas');
      },
    );

    it.each([-1, 1_000_001, 10.5])(
      'Dado taxa %s, Então rejeita',
      (lateFeeCents) => {
        expect(() =>
          validateCancellationPolicy({ noticeHours: 24, lateFeeCents }),
        ).toThrow('Taxa de cancelamento tardio inválida');
        expect(() =>
          validateCancellationPolicy({ noticeHours: 24, lateFeeCents }),
        ).toThrow(ValidationError);
      },
    );

    it('Dado config sem política, Então usa a padrão de 24 h sem taxa', () => {
      expect(validateScheduleConfig(config()).cancellationPolicy).toEqual({
        noticeHours: 24,
        lateFeeCents: 0,
      });
    });
  });

  describe('Cenário: descrição', () => {
    it('Dado dias e horário, Então descreve com rótulos em português', () => {
      expect(
        describeSchedule(
          config({
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            startHour: 7,
            endHour: 19,
          }),
        ),
      ).toBe(
        'domingo, segunda, terça, quarta, quinta, sexta, sábado, das 07:00 às 19:00',
      );
    });

    it('Dado almoço, Então acrescenta a pausa', () => {
      expect(
        describeSchedule(
          config({
            weekdays: [1, 2],
            lunchBreak: { startMinute: 750, endMinute: 810 },
          }),
        ),
      ).toBe('segunda, terça, das 08:00 às 18:00 (pausa das 12:30 às 13:30)');
    });
  });
});
