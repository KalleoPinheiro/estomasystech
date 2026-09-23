import { describe, expect, it } from 'vitest';
import { Appointment } from '@/domain/scheduling/appointment';
import {
  InvalidStatusTransitionError,
  ValidationError,
} from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';

const slot = (startIso: string, endIso: string) =>
  TimeSlot.create(new Date(startIso), new Date(endIso));

const validProps = {
  patientId: 'patient-1',
  slot: slot('2026-07-20T09:00:00Z', '2026-07-20T10:00:00Z'),
  procedure: 'Troca de bolsa de colostomia',
  price: Money.fromCents(25000),
};

describe('Feature: Agendamento de consulta', () => {
  describe('Cenário: agendar consulta', () => {
    it('Dado dados válidos, Quando agendar, Então consulta criada com status scheduled', () => {
      const appointment = Appointment.create(validProps);

      expect(appointment.id).toBeTruthy();
      expect(appointment.status).toBe('scheduled');
      expect(appointment.patientId).toBe('patient-1');
    });

    it('Dado procedimento vazio, Quando agendar, Então lança ValidationError', () => {
      expect(() =>
        Appointment.create({ ...validProps, procedure: '  ' }),
      ).toThrow(ValidationError);
    });
  });

  describe('Cenário: confirmar consulta', () => {
    it('Dado consulta agendada, Quando confirmar, Então status vira confirmed', () => {
      const appointment = Appointment.create(validProps).confirm();

      expect(appointment.status).toBe('confirmed');
    });

    it('Dado consulta cancelada, Quando confirmar, Então lança InvalidStatusTransitionError', () => {
      const cancelled = Appointment.create(validProps).cancel();

      expect(() => cancelled.confirm()).toThrow(InvalidStatusTransitionError);
    });
  });

  describe('Cenário: concluir consulta', () => {
    it('Dado consulta agendada ou confirmada, Quando concluir, Então status vira completed', () => {
      expect(Appointment.create(validProps).complete().status).toBe(
        'completed',
      );
      expect(Appointment.create(validProps).confirm().complete().status).toBe(
        'completed',
      );
    });

    it('Dado consulta cancelada, Quando concluir, Então lança InvalidStatusTransitionError', () => {
      const cancelled = Appointment.create(validProps).cancel();

      expect(() => cancelled.complete()).toThrow(InvalidStatusTransitionError);
    });
  });

  describe('Cenário: cancelar consulta', () => {
    it('Dado consulta agendada, Quando cancelar, Então status vira cancelled', () => {
      expect(Appointment.create(validProps).cancel().status).toBe('cancelled');
    });

    it('Dado cancelamento sem origem, Quando cancelar, Então registra como da clínica, com data e sem motivo', () => {
      const at = new Date('2026-07-18T10:00:00Z');
      const cancelled = Appointment.create(validProps).cancel({ at });

      expect(cancelled.cancellation).toEqual({
        by: 'clinic',
        at,
        reason: null,
      });
    });

    it('Dado consulta não cancelada, Então não tem registro de cancelamento', () => {
      expect(Appointment.create(validProps).cancellation).toBeNull();
    });

    it('Dado motivo só com espaços, Quando cancelar, Então motivo fica nulo', () => {
      const cancelled = Appointment.create(validProps).cancel({
        by: 'patient',
        reason: '   ',
      });
      expect(cancelled.cancellation?.reason).toBeNull();
      expect(cancelled.cancellation?.by).toBe('patient');
    });

    it('Dado motivo com mais de 1000 caracteres, Quando cancelar, Então lança ValidationError', () => {
      expect(() =>
        Appointment.create(validProps).cancel({ reason: 'x'.repeat(1001) }),
      ).toThrow(ValidationError);
    });

    it('Dado consulta concluída, Quando cancelar, Então lança InvalidStatusTransitionError', () => {
      const completed = Appointment.create(validProps).complete();

      expect(() => completed.cancel()).toThrow(InvalidStatusTransitionError);
    });
  });

  describe('Cenário: registrar falta (no-show)', () => {
    it('Dado consulta confirmada, Quando marcar falta, Então status vira no_show', () => {
      expect(Appointment.create(validProps).confirm().markNoShow().status).toBe(
        'no_show',
      );
    });

    it('Dado consulta concluída, Quando marcar falta, Então lança InvalidStatusTransitionError', () => {
      const completed = Appointment.create(validProps).complete();

      expect(() => completed.markNoShow()).toThrow(
        InvalidStatusTransitionError,
      );
    });
  });

  describe('Cenário: remarcar consulta', () => {
    it('Dado consulta agendada, Quando remarcar, Então novo horário aplicado e status mantido', () => {
      const newSlot = slot('2026-07-21T14:00:00Z', '2026-07-21T15:00:00Z');

      const rescheduled = Appointment.create(validProps).reschedule(newSlot);

      expect(rescheduled.slot.start).toEqual(new Date('2026-07-21T14:00:00Z'));
      expect(rescheduled.status).toBe('scheduled');
    });

    it('Dado consulta cancelada, Quando remarcar, Então lança InvalidStatusTransitionError', () => {
      const cancelled = Appointment.create(validProps).cancel();
      const newSlot = slot('2026-07-21T14:00:00Z', '2026-07-21T15:00:00Z');

      expect(() => cancelled.reschedule(newSlot)).toThrow(
        InvalidStatusTransitionError,
      );
    });
  });

  describe('Cenário: detectar conflito de horários', () => {
    it('Dado duas consultas com horários sobrepostos, Quando verificar conflictsWith, Então retorna true', () => {
      const a = Appointment.create(validProps);
      const b = Appointment.create({
        ...validProps,
        slot: slot('2026-07-20T09:30:00Z', '2026-07-20T10:30:00Z'),
      });

      expect(a.conflictsWith(b)).toBe(true);
    });

    it('Dado consulta cancelada sobreposta, Quando verificar conflictsWith, Então retorna false', () => {
      const a = Appointment.create(validProps);
      const b = Appointment.create({
        ...validProps,
        slot: slot('2026-07-20T09:30:00Z', '2026-07-20T10:30:00Z'),
      }).cancel();

      expect(a.conflictsWith(b)).toBe(false);
    });
  });
});
