import { describe, expect, it, vi } from 'vitest';
import {
  type CalendarEventInput,
  type CalendarGateway,
  LazyCalendarGateway,
  NullCalendarGateway,
  resolveCalendarGateway,
} from '@/application/ports/calendar-gateway';

const input: CalendarEventInput = {
  title: 'Curativo',
  description: 'Paciente',
  startsAt: new Date('2026-09-10T12:00:00Z'),
  endsAt: new Date('2026-09-10T13:00:00Z'),
};

const fakeGateway = (): CalendarGateway => ({
  createEvent: vi.fn().mockResolvedValue('evt-1'),
  updateEvent: vi.fn().mockResolvedValue(undefined),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  purgeEvent: vi.fn().mockResolvedValue(undefined),
});

describe('Feature: Gateway de agenda preguiçoso', () => {
  it('Dado gateway preguiçoso, Quando só é criado, Então não resolve a credencial', () => {
    const load = vi.fn().mockResolvedValue(fakeGateway());

    new LazyCalendarGateway(load);

    expect(load).not.toHaveBeenCalled();
  });

  it('Dadas várias chamadas, Então resolve uma única vez e delega ao gateway real', async () => {
    const real = fakeGateway();
    const load = vi.fn().mockResolvedValue(real);
    const lazy = new LazyCalendarGateway(load);

    await expect(lazy.createEvent(input)).resolves.toBe('evt-1');
    await lazy.updateEvent('evt-1', input);
    await lazy.deleteEvent('evt-1');
    await lazy.purgeEvent('evt-1');

    expect(load).toHaveBeenCalledTimes(1);
    expect(real.createEvent).toHaveBeenCalledWith(input);
    expect(real.updateEvent).toHaveBeenCalledWith('evt-1', input);
    expect(real.deleteEvent).toHaveBeenCalledWith('evt-1');
    expect(real.purgeEvent).toHaveBeenCalledWith('evt-1');
  });

  it('Dadas chamadas simultâneas, Então compartilham a mesma resolução', async () => {
    const load = vi.fn().mockResolvedValue(fakeGateway());
    const lazy = new LazyCalendarGateway(load);

    const [a, b] = await Promise.all([lazy.resolve(), lazy.resolve()]);

    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('Dada falha ao resolver, Quando chamar de novo, Então tenta outra vez', async () => {
    const real = fakeGateway();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('banco fora'))
      .mockResolvedValueOnce(real);
    const lazy = new LazyCalendarGateway(load);

    await expect(lazy.createEvent(input)).rejects.toThrow('banco fora');
    await expect(lazy.createEvent(input)).resolves.toBe('evt-1');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('Dado gateway comum ou preguiçoso, Quando resolveCalendarGateway, Então devolve o concreto', async () => {
    const plain = new NullCalendarGateway();
    const real = fakeGateway();

    await expect(resolveCalendarGateway(plain)).resolves.toBe(plain);
    await expect(
      resolveCalendarGateway(new LazyCalendarGateway(async () => real)),
    ).resolves.toBe(real);
  });
});
