import { describe, expect, it } from 'vitest';
import { CreatePatient } from '@/application/patients/create-patient';
import type {
  EmailGateway,
  EmailMessage,
} from '@/application/ports/email-gateway';
import {
  type ClinicReminderServices,
  SendReminders,
} from '@/application/reminders/send-reminders';
import { FollowUp } from '@/domain/followup/follow-up';
import { Guardian } from '@/domain/guardian/guardian';
import { ReminderLog } from '@/domain/messaging/reminder-log';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryReminderLogRepository } from '@/infrastructure/persistence/in-memory/in-memory-reminder-log-repository';

// now fixo: quinta 2026-07-16 12:00 UTC (suíte roda com TZ=UTC); amanhã = 17.
const NOW = new Date('2026-07-16T12:00:00Z');

class RecordingEmail implements EmailGateway {
  readonly sent: EmailMessage[] = [];
  async isEnabled(): Promise<boolean> {
    return true;
  }
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/** Conta cada chamada a um método do repositório (uma chamada = uma ida ao banco). */
const counted = <T extends object>(repo: T, calls: string[], name: string): T =>
  new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function' || typeof prop !== 'string') return value;
      return (...args: unknown[]) => {
        calls.push(`${name}.${prop}`);
        return value.apply(target, args);
      };
    },
  });

/**
 * Semeia `size` pacientes, cada um com consulta amanhã e retorno vencido; os
 * pares dependem do responsável (paciente sem e-mail, ADR-024) e os ímpares
 * têm e-mail próprio. O primeiro retorno já tem uma tentativa de recall gravada.
 */
const runWith = async (size: number) => {
  const appointments = new InMemoryAppointmentRepository();
  const followUps = new InMemoryFollowUpRepository();
  const guardians = new InMemoryGuardianRepository();
  const patients = new InMemoryPatientRepository();
  const reminderLog = new InMemoryReminderLogRepository();
  const email = new RecordingEmail();

  const guardian = Guardian.create({
    fullName: 'Ana Souza',
    relationship: 'filho',
    phone: '11977770000',
    email: 'ana@example.com',
  });
  await guardians.save(guardian);
  for (let i = 0; i < size; i += 1) {
    const patient = await new CreatePatient(patients).execute({
      fullName: `Paciente ${i}`,
      phone: `1199999${String(i).padStart(4, '0')}`,
      ...(i % 2 === 0
        ? { guardianId: guardian.id }
        : { email: `p${i}@example.com` }),
    });
    const start = new Date('2026-07-17T09:30:00Z');
    await appointments.save(
      Appointment.create({
        patientId: patient.id,
        slot: TimeSlot.create(start, new Date(start.getTime() + 3_600_000)),
        procedure: 'Troca de bolsa',
        price: Money.fromCents(25000),
      }),
    );
    const followUp = FollowUp.create({
      patientId: patient.id,
      appointmentId: null,
      dueDate: new Date('2026-07-10T12:00:00Z'),
      reason: 'Retorno',
    });
    await followUps.save(followUp);
    if (i === 0) {
      await reminderLog.save(
        ReminderLog.create('recall', followUp.id, new Date('2026-07-11'), {
          attempt: 1,
        }),
      );
    }
  }

  const calls: string[] = [];
  const services: ClinicReminderServices = {
    email,
    appointments: counted(appointments, calls, 'appointments'),
    followUps: counted(followUps, calls, 'followUps'),
    guardians: counted(guardians, calls, 'guardians'),
    patients: counted(patients, calls, 'patients'),
    reminderLog: counted(reminderLog, calls, 'reminderLog'),
  };
  const summary = await new SendReminders(
    [{ id: 'clinic-a', name: 'Clínica Alfa' }],
    async () => services,
  ).execute(NOW);
  return { calls, summary, email };
};

/** Leituras do lote; a gravação do log é uma por envio, por desenho. */
const reads = (calls: string[]) =>
  calls.filter((c) => c !== 'reminderLog.save');

describe('Feature: Lembretes — consultas em lote (#361)', () => {
  it('Dado 4 ou 40 pacientes, Quando rodar o job, Então o número de idas ao banco não cresce', async () => {
    const small = await runWith(4);
    const large = await runWith(40);

    expect(small.summary.failed).toBe(0);
    expect(large.summary.sent).toBe(large.email.sent.length);
    expect(reads(large.calls)).toEqual(reads(small.calls));
    expect(reads(large.calls).length).toBeLessThanOrEqual(10);
  });

  it('Dado pacientes com e sem e-mail próprio, Quando rodar o job, Então o destinatário segue a regra do responsável', async () => {
    const { email, summary } = await runWith(4);

    // 4 consultas + 4 retornos; a tentativa 1 do primeiro retorno já saiu e
    // a próxima só vence em D+7.
    expect(summary.sent).toBe(7);
    const recipients = email.sent.map((m) => m.to).sort();
    expect(recipients.filter((to) => to === 'ana@example.com')).toHaveLength(3);
    expect(recipients).toContain('p1@example.com');
    expect(recipients).toContain('p3@example.com');
  });
});
