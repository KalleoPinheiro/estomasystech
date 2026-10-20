import { describe, expect, it, vi } from 'vitest';
import { SendWhatsAppReminder } from '@/application/reminders/send-whatsapp-reminder';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import { FollowUp } from '@/domain/followup/follow-up';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { NotFoundError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryReminderLogRepository } from '@/infrastructure/persistence/in-memory/in-memory-reminder-log-repository';

const NOW = new Date('2026-10-20T12:00:00Z');
const semEmpresa = {
  findById: async () => null,
} as unknown as ClinicRepository;

async function setup() {
  const patients = new InMemoryPatientRepository();
  const appointments = new InMemoryAppointmentRepository();
  const followUps = new InMemoryFollowUpRepository();
  const reminderLog = new InMemoryReminderLogRepository();
  const maria = Patient.create({
    fullName: 'Maria da Silva',
    phone: '11999990000',
  });
  await patients.save(maria);
  const useCase = new SendWhatsAppReminder(
    appointments,
    followUps,
    patients,
    semEmpresa,
    reminderLog,
  );
  return { patients, appointments, followUps, reminderLog, maria, useCase };
}

describe('Feature: Botão Enviar WhatsApp da recepção (COM-RN)', () => {
  it('Dado consulta de paciente que não existe mais, Quando enviar, Então recusa com não encontrado e nada é registrado', async () => {
    const { appointments, reminderLog, useCase } = await setup();
    const start = new Date('2026-10-21T12:00:00Z');
    const appointment = Appointment.create({
      patientId: 'paciente-apagado',
      slot: TimeSlot.create(start, new Date(start.getTime() + 3600_000)),
      procedure: 'Curativo',
      price: Money.fromCents(15000),
    });
    await appointments.save(appointment);
    const save = vi.spyOn(reminderLog, 'save');

    await expect(
      useCase.execute({
        kind: 'confirmation',
        referenceId: appointment.id,
        clinicId: 'c-1',
        now: NOW,
      }),
    ).rejects.toThrow(new NotFoundError('Paciente', 'paciente-apagado'));
    expect(save).not.toHaveBeenCalled();
  });

  it('Dado empresa sem cadastro e retorno pendente, Quando enviar, Então a mensagem sai assinada como "clínica" e o clique é registrado', async () => {
    const { followUps, maria, useCase } = await setup();
    const followUp = FollowUp.create({
      patientId: maria.id,
      dueDate: new Date('2026-11-01T12:00:00Z'),
      reason: 'Reavaliar lesão',
    });
    await followUps.save(followUp);

    const result = await useCase.execute({
      kind: 'recall',
      referenceId: followUp.id,
      clinicId: 'c-1',
      now: NOW,
    });

    expect(decodeURIComponent(result.url)).toContain('clínica');
    expect(result.sentAt).toEqual(NOW);
  });

  it('Dado registro do clique que não volta na leitura, Quando enviar, Então devolve o horário do próprio clique', async () => {
    const { followUps, reminderLog, maria, useCase } = await setup();
    const followUp = FollowUp.create({
      patientId: maria.id,
      dueDate: new Date('2026-11-01T12:00:00Z'),
      reason: 'Reavaliar lesão',
    });
    await followUps.save(followUp);
    vi.spyOn(reminderLog, 'firstSentAt').mockResolvedValue(new Map());

    const result = await useCase.execute({
      kind: 'recall',
      referenceId: followUp.id,
      clinicId: 'c-1',
      now: NOW,
    });

    expect(result.sentAt).toEqual(NOW);
  });
});
