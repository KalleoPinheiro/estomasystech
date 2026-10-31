import { describe, expect, it, vi } from 'vitest';
import type { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { ScheduleRecurringAppointments } from '@/application/appointments/schedule-recurring-appointments';
import { ManageEmailChannel } from '@/application/clinic/manage-email-channel';
import type { EmailGateway } from '@/application/ports/email-gateway';
import { SendReminders } from '@/application/reminders/send-reminders';
import {
  ClinicChannel,
  type ClinicChannelRepository,
} from '@/domain/clinic/clinic-channel';

vi.mock('@/lib/log-error', () => ({ logError: vi.fn() }));

describe('Feature: Falhas que não chegam como Error (provedores e infraestrutura)', () => {
  it('Dado empresa cujos serviços falham com texto puro, Quando enviar lembretes, Então a empresa é marcada com o erro e as demais seguem', async () => {
    const sender = new SendReminders(
      [{ id: 'c-1', name: 'Alfa', status: 'active' }] as never,
      async () => {
        throw 'banco indisponível';
      },
    );

    const summary = await sender.execute(new Date('2026-10-20T12:00:00Z'));

    expect(summary.clinics).toEqual([
      {
        clinicId: 'c-1',
        sent: 0,
        skipped: 0,
        failed: 0,
        error: 'banco indisponível',
      },
    ]);
  });

  it('Dado provedor de e-mail que recusa com texto puro, Quando testar o canal, Então grava a falha sem vazar chave nem destinatário', async () => {
    let saved: ClinicChannel | null = ClinicChannel.configure({
      clinicId: 'c-1',
      channel: 'email',
      provider: 'resend',
      sender: 'clinica@alfa.com',
      apiKey: 're_segredo123',
      by: 'admin@alfa.com',
    });
    const channels = {
      find: async () => saved,
      save: async (channel: ClinicChannel) => {
        saved = channel;
      },
    } as unknown as ClinicChannelRepository;
    const email = {
      isEnabled: async () => true,
      send: async () => {
        throw 'chave re_segredo123 recusada para paciente@x.com';
      },
    } as EmailGateway;

    const tested = await new ManageEmailChannel(channels, email, 'c-1').test(
      'paciente@x.com',
    );

    expect(tested.lastError).toBe('chave <chave> recusada para <destinatário>');
  });

  it('Dado agenda que falha com texto puro numa ocorrência, Quando agendar a série, Então a ocorrência é pulada com motivo genérico', async () => {
    const schedule = {
      assertPatient: async () => undefined,
      assertProfessional: async () => undefined,
      execute: async () => {
        throw 'falha desconhecida';
      },
    } as unknown as ScheduleAppointment;

    const result = await new ScheduleRecurringAppointments(schedule).execute({
      patientId: 'p-1',
      startsAt: new Date('2026-11-02T12:00:00Z'),
      endsAt: new Date('2026-11-02T13:00:00Z'),
      procedure: 'Curativo',
      occurrences: 2,
    } as never);

    expect(result.created).toHaveLength(0);
    expect(result.skipped.map((s) => s.reason)).toEqual([
      'Erro desconhecido',
      'Erro desconhecido',
    ]);
  });
});
