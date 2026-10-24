import { describe, expect, it } from 'vitest';
import { dayCounts, nextAppointment } from '@/lib/day-summary';
import type { AppointmentDto } from '@/lib/dto';

const at = (hour: number) =>
  new Date(`2026-10-21T${String(hour).padStart(2, '0')}:00:00Z`);
const appt = (
  id: string,
  startHour: number,
  status = 'scheduled',
): AppointmentDto => ({
  id,
  patientId: `p-${id}`,
  patientName: `Paciente ${id}`,
  startsAt: at(startHour).toISOString(),
  endsAt: at(startHour + 1).toISOString(),
  procedure: 'Curativo',
  priceCents: 0,
  notes: null,
  status,
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
});

describe('Feature: tela Hoje (#428)', () => {
  describe('Cenário: próximo atendimento', () => {
    it('Dado consultas fora de ordem, Quando pedir o próximo, Então volta a que começa mais cedo entre as abertas', () => {
      const list = [appt('c', 15), appt('a', 10), appt('b', 12)];
      expect(nextAppointment(list, at(9))?.id).toBe('a');
    });

    it('Dado uma consulta em andamento, Então ela ainda é a próxima', () => {
      expect(
        nextAppointment(
          [appt('a', 10), appt('b', 12)],
          new Date('2026-10-21T10:30:00Z'),
        )?.id,
      ).toBe('a');
    });

    it('Dado consulta já terminada, concluída, cancelada ou com falta, Então não conta', () => {
      const list = [
        appt('passada', 8),
        appt('feita', 12, 'completed'),
        appt('cancelada', 13, 'cancelled'),
        appt('faltou', 14, 'no_show'),
        appt('confirmada', 16, 'confirmed'),
      ];
      expect(nextAppointment(list, at(10))?.id).toBe('confirmada');
    });

    it('Dado nenhuma consulta aberta, Então não há próximo', () => {
      expect(nextAppointment([], at(9))).toBeNull();
      expect(nextAppointment([appt('a', 8)], at(12))).toBeNull();
    });
  });

  describe('Cenário: números do dia', () => {
    it('Dado consultas de vários status, Então conta as não canceladas e as concluídas', () => {
      const list = [
        appt('a', 8, 'completed'),
        appt('b', 9, 'scheduled'),
        appt('c', 10, 'cancelled'),
        appt('d', 11, 'completed'),
      ];
      expect(dayCounts(list)).toEqual({ total: 3, completed: 2 });
    });

    it('Dado dia sem consultas, Então zero de zero', () => {
      expect(dayCounts([])).toEqual({ total: 0, completed: 0 });
    });
  });
});
