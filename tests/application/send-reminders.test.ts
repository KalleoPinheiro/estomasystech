import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePatient } from '@/application/patients/create-patient';
import {
  type EmailGateway,
  type EmailMessage,
  NullEmailGateway,
} from '@/application/ports/email-gateway';
import {
  type ClinicReminderServices,
  SendReminders,
} from '@/application/reminders/send-reminders';
import { FollowUp } from '@/domain/followup/follow-up';
import { Guardian } from '@/domain/guardian/guardian';
import { ReminderLog } from '@/domain/messaging/reminder-log';
import type { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryReminderLogRepository } from '@/infrastructure/persistence/in-memory/in-memory-reminder-log-repository';

class FakeEmailGateway implements EmailGateway {
  async isEnabled(): Promise<boolean> {
    return true;
  }
  readonly sent: EmailMessage[] = [];
  failFor: string | null = null;

  async send(message: EmailMessage): Promise<void> {
    if (this.failFor && message.to === this.failFor) {
      throw new Error('falha simulada de API');
    }
    this.sent.push(message);
  }
}

interface ClinicFixture extends ClinicReminderServices {
  appointments: InMemoryAppointmentRepository;
  followUps: InMemoryFollowUpRepository;
  patients: InMemoryPatientRepository;
  reminderLog: InMemoryReminderLogRepository;
}

const newClinic = (email: EmailGateway): ClinicFixture => ({
  email,
  appointments: new InMemoryAppointmentRepository(),
  followUps: new InMemoryFollowUpRepository(),
  guardians: new InMemoryGuardianRepository(),
  patients: new InMemoryPatientRepository(),
  reminderLog: new InMemoryReminderLogRepository(),
});

// now fixo: quinta 2026-07-16 12:00 UTC (suíte roda com TZ=UTC); amanhã = 17.
const NOW = new Date('2026-07-16T12:00:00Z');
const CLINIC = { id: 'clinic-a', name: 'Clínica Alfa' };

const dayAfter = (base: Date, days: number) =>
  new Date(base.getTime() + days * 86_400_000);

describe('Feature: Lembretes por e-mail — confirmação D-1 e recall de retornos', () => {
  let clinic: ClinicFixture;
  let email: FakeEmailGateway;
  let maria: Patient;

  beforeEach(async () => {
    email = new FakeEmailGateway();
    clinic = newClinic(email);
    vi.stubEnv('APP_URL', 'https://vitta.example.com');
    maria = await new CreatePatient(clinic.patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const run = (now: Date = NOW, gateway: EmailGateway = email) =>
    new SendReminders([CLINIC], async () => ({
      ...clinic,
      email: gateway,
    })).execute(now);

  const scheduleAt = async (
    startsAt: Date,
    patientId = maria.id,
    repo = clinic.appointments,
  ) => {
    const appointment = Appointment.create({
      patientId,
      slot: TimeSlot.create(startsAt, new Date(startsAt.getTime() + 3_600_000)),
      procedure: 'Troca de bolsa',
      price: Money.fromCents(25000),
    });
    await repo.save(appointment);
    return appointment;
  };

  const scheduleTomorrow = () => scheduleAt(new Date('2026-07-17T09:30:00Z'));

  const addFollowUp = async (
    due: Date,
    patientId = maria.id,
    repo = clinic.followUps,
  ) => {
    const followUp = FollowUp.create({
      patientId,
      appointmentId: null,
      dueDate: due,
      reason: 'Retorno: Curativo de lesão sacral',
    });
    await repo.save(followUp);
    return followUp;
  };

  describe('Confirmação D-1', () => {
    it('C1 confirmação por e-mail traz nome, data, hora, clínica e portal, sem procedimento', async () => {
      await scheduleTomorrow();

      const summary = await run();

      expect(summary.sent).toBe(1);
      expect(email.sent).toHaveLength(1);
      const [message] = email.sent;
      expect(message.to).toBe('maria@example.com');
      expect(message.text).toContain('Maria');
      expect(message.text).not.toContain('Maria da Silva');
      expect(message.text).toContain('17/07/2026');
      expect(message.text).toContain('09:30');
      expect(message.text).toContain('Clínica Alfa');
      expect(message.text).toContain('https://vitta.example.com/portal');
      expect(message.text).not.toContain('Troca de bolsa');
      expect(message.subject).not.toContain('Troca de bolsa');
    });

    it('C2 confirmação grava log de e-mail tentativa 1', async () => {
      const appointment = await scheduleTomorrow();

      await run();

      expect(clinic.reminderLog.items).toHaveLength(1);
      const [log] = clinic.reminderLog.items;
      expect(log.kind).toBe('confirmation');
      expect(log.referenceId).toBe(appointment.id);
      expect(log.channel).toBe('email');
      expect(log.attempt).toBe(1);
      expect(log.sentOn).toBe('2026-07-16');
    });

    it('Dado consulta amanhã que não está scheduled, Quando rodar, Então não envia', async () => {
      const appointment = await scheduleTomorrow();
      await clinic.appointments.save(appointment.confirm());

      const summary = await run();

      expect(summary.sent).toBe(0);
      expect(email.sent).toHaveLength(0);
    });
  });

  describe('Responsável como destinatário (#329)', () => {
    const withGuardian = async (guardianEmail: string | null) => {
      const guardian = Guardian.create({
        fullName: 'Ana Souza',
        relationship: 'filho',
        phone: '11977770000',
        email: guardianEmail,
      });
      await clinic.guardians.save(guardian);
      const sem = await new CreatePatient(clinic.patients).execute({
        fullName: 'José da Silva',
        phone: '11999990001',
        guardianId: guardian.id,
      });
      return sem;
    };

    it('Dado paciente sem e-mail e responsável com e-mail, Quando houver consulta amanhã, Então avisa o responsável sobre o paciente, sem portal', async () => {
      const jose = await withGuardian('ana@example.com');
      await scheduleAt(new Date('2026-07-17T09:30:00Z'), jose.id);

      const summary = await run();

      expect(summary.sent).toBe(1);
      const [message] = email.sent;
      expect(message.to).toBe('ana@example.com');
      expect(message.text).toContain('Olá, Ana!');
      expect(message.text).toContain('a consulta de José é em');
      expect(message.text).not.toContain('José da Silva');
      expect(message.text).not.toContain('portal');
    });

    it('Dado recall vencido, Quando o paciente não tem e-mail, Então o aviso vai ao responsável', async () => {
      const jose = await withGuardian('ana@example.com');
      await addFollowUp(new Date('2026-07-15T12:00:00Z'), jose.id);

      await run();

      expect(email.sent[0].to).toBe('ana@example.com');
      expect(email.sent[0].text).toContain('O retorno de José');
      expect(email.sent[0].text).not.toContain('portal');
    });

    it('Dado paciente com e-mail próprio, Quando tem responsável, Então o aviso vai ao paciente', async () => {
      const guardian = Guardian.create({
        fullName: 'Ana Souza',
        relationship: 'filho',
        phone: '11977770000',
        email: 'ana@example.com',
      });
      await clinic.guardians.save(guardian);
      await clinic.patients.save(maria.update({ guardianId: guardian.id }));
      await scheduleTomorrow();

      await run();

      expect(email.sent.map((m) => m.to)).toEqual(['maria@example.com']);
    });

    it('Dado responsável sem e-mail ou sem responsável, Quando o paciente não tem e-mail, Então pula sem erro', async () => {
      const jose = await withGuardian(null);
      const sozinha = await new CreatePatient(clinic.patients).execute({
        fullName: 'Rosa Lima',
        phone: '11999990002',
      });
      await scheduleAt(new Date('2026-07-17T09:30:00Z'), jose.id);
      await scheduleAt(new Date('2026-07-17T10:30:00Z'), sozinha.id);

      const summary = await run();

      expect(summary.skipped).toBe(2);
      expect(summary.sent).toBe(0);
      expect(email.sent).toHaveLength(0);
      expect(clinic.reminderLog.items).toHaveLength(0);
    });
  });

  describe('Fuso da aplicação (#205)', () => {
    it('C30 amanhã calculado no fuso da aplicação', async () => {
      // Processo em UTC; clínica em São Paulo (UTC-3). 02:00Z do dia 17 ainda
      // é 23:00 do dia 16 em Brasília: "amanhã" é o dia 17 de Brasília
      // (03:00Z do 17 até 03:00Z do 18), não o 18 do relógio UTC.
      vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
      const now = new Date('2026-07-17T02:00:00Z');
      await scheduleAt(new Date('2026-07-17T12:00:00Z')); // 09:00 BRT do 17
      await scheduleAt(new Date('2026-07-18T12:00:00Z')); // 09:00 BRT do 18

      const summary = await run(now);

      expect(summary.sent).toBe(1);
      expect(email.sent[0].text).toContain('17/07/2026');
      expect(email.sent[0].text).toContain('09:00');
      expect(clinic.reminderLog.items[0].sentOn).toBe('2026-07-16');
    });
  });

  describe('Recall', () => {
    it('C3 recall por e-mail traz nome, data, clínica e portal, sem motivo', async () => {
      const followUp = await addFollowUp(new Date('2026-07-15T12:00:00Z'));

      const summary = await run();

      expect(summary.sent).toBe(1);
      const [message] = email.sent;
      expect(message.to).toBe('maria@example.com');
      expect(message.text).toContain('Maria');
      expect(message.text).toContain('15/07/2026');
      expect(message.text).toContain('Clínica Alfa');
      expect(message.text).toContain(
        'Agende seu retorno no portal: https://vitta.example.com/portal.',
      );
      expect(message.text).not.toContain('Curativo');
      expect(message.text).not.toContain('lesão');
      const [log] = clinic.reminderLog.items;
      expect(log.kind).toBe('recall');
      expect(log.referenceId).toBe(followUp.id);
      expect(log.channel).toBe('email');
      expect(log.attempt).toBe(1);
    });

    it('C4 APP_URL sem esquema não gera link', async () => {
      vi.stubEnv('APP_URL', 'vitta.example.com');
      await scheduleTomorrow();
      await addFollowUp(new Date('2026-07-15T12:00:00Z'));

      await run();

      expect(email.sent).toHaveLength(2);
      for (const message of email.sent) {
        expect(message.text).not.toContain('vitta.example.com');
        expect(message.text).toContain('Entre em contato com a clínica');
      }
    });

    it('Dado APP_URL com barras extras, Quando enviar, Então normaliza o link', async () => {
      vi.stubEnv('APP_URL', 'https://vitta.example.com//');
      await addFollowUp(new Date('2026-07-15T12:00:00Z'));

      await run();

      expect(email.sent[0].text).toContain('https://vitta.example.com/portal.');
    });
  });

  describe('Paciente, falha e dry-run', () => {
    it('C5 paciente inativo é pulado', async () => {
      await scheduleTomorrow();
      await addFollowUp(new Date('2026-07-15T12:00:00Z'));
      await clinic.patients.save(maria.deactivate());

      const summary = await run();

      expect(summary.sent).toBe(0);
      expect(summary.skipped).toBe(2);
      expect(email.sent).toHaveLength(0);
    });

    it('Dado paciente sem e-mail de contato (#325), Quando rodar, Então pula sem enviar nem registrar log', async () => {
      const semEmail = await new CreatePatient(clinic.patients).execute({
        fullName: 'Paciente Sem Email',
        phone: '11988880000',
      });
      await scheduleAt(new Date('2026-07-17T09:30:00Z'), semEmail.id);
      await scheduleTomorrow();

      const summary = await run();

      expect(summary.sent).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.failed).toBe(0);
      expect(email.sent.map((m) => m.to)).toEqual(['maria@example.com']);
    });

    it('Dado consulta órfã (paciente removido), Quando rodar, Então pula sem enviar', async () => {
      await scheduleAt(new Date('2026-07-17T09:00:00Z'), 'paciente-removido');

      const summary = await run();

      expect(summary.skipped).toBe(1);
      expect(email.sent).toHaveLength(0);
    });

    it('C6 falha de envio conta failed, não grava log e o lote segue', async () => {
      const joao = await new CreatePatient(clinic.patients).execute({
        fullName: 'João Souza',
        email: 'joao@example.com',
        phone: '11988880000',
      });
      await scheduleTomorrow();
      await scheduleAt(new Date('2026-07-17T11:00:00Z'), joao.id);
      email.failFor = 'maria@example.com';
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const summary = await run();

      expect(summary.failed).toBe(1);
      expect(summary.sent).toBe(1);
      expect(email.sent.map((m) => m.to)).toEqual(['joao@example.com']);
      expect(clinic.reminderLog.items).toHaveLength(1);
      // Sem log, a próxima rodada tenta de novo.
      email.failFor = null;
      const retry = await run();
      expect(retry.sent).toBe(1);
    });

    it('C7 dry-run loga, pula e não grava log', async () => {
      await scheduleTomorrow();
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});

      const summary = await run(NOW, new NullEmailGateway());

      expect(summary.clinics[0].channel).toBe('none');
      expect(summary.sent).toBe(0);
      expect(summary.skipped).toBe(1);
      expect(clinic.reminderLog.items).toHaveLength(0);
      // Só metadados: destinatário mascarado e assunto — nunca o corpo (CWE-532).
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('ma***@example.com'),
      );
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('Clínica Alfa'),
      );
      const logged = info.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).not.toContain('maria@example.com');
      expect(logged).not.toContain('Olá');
    });
  });

  describe('Por empresa', () => {
    it('C9 falha de uma empresa não impede as demais', async () => {
      await scheduleTomorrow();
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const summary = await new SendReminders(
        [{ id: 'clinic-broken', name: 'Quebrada' }, CLINIC],
        async (clinicId) => {
          if (clinicId === 'clinic-broken') {
            throw new Error('banco indisponível');
          }
          return clinic;
        },
      ).execute(NOW);

      expect(summary.clinics).toEqual([
        {
          clinicId: 'clinic-broken',
          sent: 0,
          skipped: 0,
          failed: 0,
          error: 'banco indisponível',
        },
        {
          clinicId: 'clinic-a',
          channel: 'configured',
          sent: 1,
          skipped: 0,
          failed: 0,
        },
      ]);
      expect(summary.sent).toBe(1);
    });

    it('Dado duas empresas, Quando rodar, Então cada e-mail leva o nome da própria clínica', async () => {
      const other = newClinic(email);
      const ana = await new CreatePatient(other.patients).execute({
        fullName: 'Ana Lima',
        email: 'ana@example.com',
        phone: '11977770000',
      });
      await scheduleTomorrow();
      await scheduleAt(
        new Date('2026-07-17T10:00:00Z'),
        ana.id,
        other.appointments,
      );

      const summary = await new SendReminders(
        [CLINIC, { id: 'clinic-b', name: 'Clínica Beta' }],
        async (clinicId) => (clinicId === 'clinic-b' ? other : clinic),
      ).execute(NOW);

      const toAna = email.sent.find((m) => m.to === 'ana@example.com');
      expect(toAna?.text).toContain('Clínica Beta');
      expect(toAna?.text).not.toContain('Clínica Alfa');
      expect(summary.clinics.map((c) => [c.clinicId, c.sent])).toEqual([
        ['clinic-a', 1],
        ['clinic-b', 1],
      ]);
    });

    it('Dada uma empresa ativa e uma suspensa (B5), Quando rodar, Então ignora clínica suspensa: não abre o escopo, não envia e ela fica fora do resumo', async () => {
      const other = newClinic(email);
      const ana = await new CreatePatient(other.patients).execute({
        fullName: 'Ana Lima',
        email: 'ana@example.com',
        phone: '11977770000',
      });
      await scheduleTomorrow();
      await scheduleAt(
        new Date('2026-07-17T10:00:00Z'),
        ana.id,
        other.appointments,
      );
      const servicesFor = vi.fn(async (clinicId: string) =>
        clinicId === 'clinic-b' ? other : clinic,
      );

      const summary = await new SendReminders(
        [
          { ...CLINIC, status: 'active' },
          { id: 'clinic-b', name: 'Clínica Beta', status: 'suspended' },
        ],
        servicesFor,
      ).execute(NOW);

      expect(servicesFor).toHaveBeenCalledTimes(1);
      expect(servicesFor).toHaveBeenCalledWith('clinic-a');
      expect(email.sent.map((m) => m.to)).toEqual(['maria@example.com']);
      expect(summary.clinics.map((c) => c.clinicId)).toEqual(['clinic-a']);
      expect(summary.sent).toBe(1);
    });

    it('C2/#265 falha de envio não tenta outro canal: conta failed, o lote segue e o canal de outra clínica não é usado', async () => {
      const emailB = new FakeEmailGateway();
      const other = newClinic(emailB);
      const joao = await new CreatePatient(clinic.patients).execute({
        fullName: 'João Souza',
        email: 'joao@example.com',
        phone: '11988880000',
      });
      const ana = await new CreatePatient(other.patients).execute({
        fullName: 'Ana Lima',
        email: 'ana@example.com',
        phone: '11977770000',
      });
      await scheduleTomorrow();
      await scheduleAt(new Date('2026-07-17T11:00:00Z'), joao.id);
      await scheduleAt(
        new Date('2026-07-17T10:00:00Z'),
        ana.id,
        other.appointments,
      );
      email.failFor = 'maria@example.com';
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const summary = await new SendReminders(
        [CLINIC, { id: 'clinic-b', name: 'Clínica Beta' }],
        async (clinicId) => (clinicId === 'clinic-b' ? other : clinic),
      ).execute(NOW);

      expect(summary.clinics[0]).toMatchObject({
        clinicId: 'clinic-a',
        sent: 1,
        failed: 1,
      });
      expect(email.sent.map((m) => m.to)).toEqual(['joao@example.com']);
      expect(emailB.sent.map((m) => m.to)).toEqual(['ana@example.com']);
      expect(summary.clinics[1]).toMatchObject({
        clinicId: 'clinic-b',
        sent: 1,
      });
    });

    it('C11 501 retornos geram 501 e-mails', async () => {
      for (let i = 0; i < 501; i += 1) {
        await addFollowUp(new Date('2026-07-15T12:00:00Z'));
      }

      const summary = await run();

      expect(summary.sent).toBe(501);
      expect(email.sent).toHaveLength(501);
    });
  });

  describe('Cadência do recall', () => {
    // Vencimento em D = 01/06, meio-dia; execução diária também ao meio-dia.
    const D = new Date('2026-06-01T12:00:00Z');

    it('C12 cadência D+1, D+7, D+30', async () => {
      await addFollowUp(D);
      const sentOnDays: number[] = [];

      for (let offset = 0; offset <= 31; offset += 1) {
        const before = email.sent.length;
        await run(dayAfter(D, offset));
        if (email.sent.length > before) sentOnDays.push(offset);
      }

      expect(sentOnDays).toEqual([1, 7, 30]);
      expect(email.sent).toHaveLength(3);
      expect(clinic.reminderLog.items.map((log) => log.attempt)).toEqual([
        1, 2, 3,
      ]);
    });

    it('C13 após a 3ª tentativa não envia mais', async () => {
      const followUp = await addFollowUp(D);
      await clinic.reminderLog.save(
        ReminderLog.create('recall', followUp.id, dayAfter(D, 30), {
          attempt: 3,
        }),
      );

      for (const offset of [31, 60, 365]) {
        await run(dayAfter(D, offset));
      }

      expect(email.sent).toHaveLength(0);
      expect((await clinic.followUps.findById(followUp.id))?.status).toBe(
        'pending',
      );
    });

    it('C14 envia só a tentativa mais alta cabível', async () => {
      await addFollowUp(D);

      await run(dayAfter(D, 60));
      await run(dayAfter(D, 61));
      await run(dayAfter(D, 90));

      expect(email.sent).toHaveLength(1);
      expect(clinic.reminderLog.items.map((log) => log.attempt)).toEqual([3]);
    });

    it('C15 retorno resolvido não recebe próxima tentativa', async () => {
      const done = await addFollowUp(D);
      const cancelled = await addFollowUp(D);
      await run(dayAfter(D, 1));
      expect(email.sent).toHaveLength(2);

      await clinic.followUps.save(done.markDone());
      await clinic.followUps.save(cancelled.cancel());
      for (let offset = 2; offset <= 31; offset += 1) {
        await run(dayAfter(D, offset));
      }

      expect(email.sent).toHaveLength(2);
    });

    it('C16 segunda execução do dia não reenvia', async () => {
      await scheduleTomorrow();
      await addFollowUp(new Date('2026-07-15T12:00:00Z'));

      await run(NOW);
      const second = await run(new Date('2026-07-16T18:00:00Z'));

      expect(second.sent).toBe(0);
      expect(email.sent).toHaveLength(2);
    });

    it('C17 virada 23:30 em São Paulo usa a data local', async () => {
      vi.stubEnv('TZ', 'America/Sao_Paulo');
      vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
      // Consulta 17/07 09:00 local (12:00 UTC).
      await scheduleAt(new Date('2026-07-17T12:00:00Z'));

      // 16/07 20:00 local (23:00 UTC) e 16/07 23:30 local (02:30 UTC do dia 17).
      await run(new Date('2026-07-16T23:00:00Z'));
      await run(new Date('2026-07-17T02:30:00Z'));

      expect(email.sent).toHaveLength(1);
      expect(clinic.reminderLog.items[0].sentOn).toBe('2026-07-16');
      expect(email.sent[0].text).toContain('17/07/2026');
      expect(email.sent[0].text).toContain('09:00');
    });

    it('C17 às 23:30 locais a consulta do dia seguinte local ainda é "amanhã"', async () => {
      vi.stubEnv('TZ', 'America/Sao_Paulo');
      vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
      // Consulta 17/07 08:00 local (11:00 UTC); job às 23:30 do dia 16 local.
      await scheduleAt(new Date('2026-07-17T11:00:00Z'));

      const summary = await run(new Date('2026-07-17T02:30:00Z'));

      expect(summary.sent).toBe(1);
      expect(clinic.reminderLog.items[0].sentOn).toBe('2026-07-16');
    });
  });

  describe('Canais independentes', () => {
    it('C26 clique de WhatsApp não suprime o e-mail', async () => {
      const appointment = await scheduleTomorrow();
      const followUp = await addFollowUp(new Date('2026-07-15T12:00:00Z'));
      for (const [kind, id] of [
        ['confirmation', appointment.id],
        ['recall', followUp.id],
      ] as const) {
        await clinic.reminderLog.save(
          ReminderLog.create(kind, id, new Date('2026-07-16T08:00:00Z'), {
            channel: 'whatsapp_link',
          }),
        );
      }

      const summary = await run();

      expect(summary.sent).toBe(2);
      expect(email.sent).toHaveLength(2);
    });
  });
});
