import type { calendar_v3 } from 'googleapis';
import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarGateway } from '@/infrastructure/calendar/google-calendar-gateway';

function gatewayWith(remove: () => Promise<unknown>) {
  const client = { events: { delete: vi.fn(remove) } };
  const gateway = Reflect.construct(GoogleCalendarGateway, [
    client as unknown as calendar_v3.Calendar,
    'primary',
  ]) as GoogleCalendarGateway;
  return { gateway, remove: client.events.delete };
}

describe('Feature: apagar evento do Google Agenda com falha visível (#311, RES-05/06)', () => {
  it('Dado evento existente, Quando apaga, Então chama a API com o calendário e o id', async () => {
    const { gateway, remove } = gatewayWith(async () => ({}));

    await expect(gateway.purgeEvent('evt-1')).resolves.toBeUndefined();

    expect(remove).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'evt-1',
    });
  });

  it.each([404, 410, '404'])(
    'Dado evento que já não existe (%s), Quando apaga, Então conta como apagado',
    async (code) => {
      const { gateway } = gatewayWith(async () => {
        throw Object.assign(new Error('gone'), { code });
      });

      await expect(gateway.purgeEvent('evt-1')).resolves.toBeUndefined();
    },
  );

  it.each([500, 403, undefined])(
    'Dada falha %s da API, Quando apaga, Então propaga para a retenção tentar de novo',
    async (code) => {
      const { gateway } = gatewayWith(async () => {
        throw Object.assign(new Error('Google fora'), { code });
      });

      await expect(gateway.purgeEvent('evt-1')).rejects.toThrow('Google fora');
    },
  );

  it('Dado erro que não é objeto, Quando apaga, Então propaga', async () => {
    const { gateway } = gatewayWith(async () => {
      throw null;
    });

    await expect(gateway.purgeEvent('evt-1')).rejects.toBeNull();
  });
});
