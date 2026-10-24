import { describe, expect, it } from 'vitest';
import { isPendingClosure, pendingClosure } from '@/lib/day-summary';
import type { AppointmentDto } from '@/lib/dto';

const agora = new Date('2026-10-23T12:00:00.000Z');

function consulta(
  id: string,
  status: string,
  startsAt: string,
  endsAt: string,
): AppointmentDto {
  return { id, status, startsAt, endsAt } as AppointmentDto;
}

describe('Feature: consulta passada sem desfecho (#480)', () => {
  it('Dado consultas agendada, confirmada, concluída, cancelada e falta já passadas, Quando filtrar, Então só agendada e confirmada pedem desfecho, da mais antiga à mais nova', () => {
    const lista = [
      consulta(
        'b',
        'confirmed',
        '2026-10-21T10:00:00Z',
        '2026-10-21T11:00:00Z',
      ),
      consulta(
        'a',
        'scheduled',
        '2026-10-19T10:00:00Z',
        '2026-10-19T11:00:00Z',
      ),
      consulta(
        'c',
        'completed',
        '2026-10-20T10:00:00Z',
        '2026-10-20T11:00:00Z',
      ),
      consulta(
        'd',
        'cancelled',
        '2026-10-20T10:00:00Z',
        '2026-10-20T11:00:00Z',
      ),
      consulta('e', 'no_show', '2026-10-20T10:00:00Z', '2026-10-20T11:00:00Z'),
    ];
    expect(pendingClosure(lista, agora).map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('Dado consulta em andamento ou futura, Quando checar, Então ainda não é pendência', () => {
    expect(
      isPendingClosure(
        { status: 'scheduled', endsAt: '2026-10-23T13:00:00Z' },
        agora,
      ),
    ).toBe(false);
    expect(
      isPendingClosure(
        { status: 'confirmed', endsAt: '2026-10-24T13:00:00Z' },
        agora,
      ),
    ).toBe(false);
  });
});
