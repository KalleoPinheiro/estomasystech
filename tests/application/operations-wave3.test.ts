import { beforeEach, describe, expect, it } from 'vitest';
import { CompleteAppointment } from '@/application/appointments/complete-appointment';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { ScheduleRecurringAppointments } from '@/application/appointments/schedule-recurring-appointments';
import { CreatePatient } from '@/application/patients/create-patient';
import { aggregateProduction } from '@/application/reports/production';
import { SessionPackage } from '@/domain/billing/package';
import type { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import {
  SchedulingConflictError,
  ValidationError,
} from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryProducedSessionRepository } from '@/infrastructure/persistence/in-memory/in-memory-produced-session-repository';

// 2026-07-20 é segunda-feira; horários em UTC (testes rodam com TZ=UTC).
describe('Onda 3 — operação multi-profissional', () => {
  let patientRepo: InMemoryPatientRepository;
  let appointmentRepo: InMemoryAppointmentRepository;
  let maria: Patient;

  beforeEach(async () => {
    patientRepo = new InMemoryPatientRepository();
    appointmentRepo = new InMemoryAppointmentRepository();
    maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
  });

  const schedule = (
    hour: number,
    professionalId: string | null,
    patientId = maria.id,
  ) =>
    new ScheduleAppointment(appointmentRepo, patientRepo).execute({
      patientId,
      startsAt: new Date(`2026-07-20T${String(hour).padStart(2, '0')}:00:00Z`),
      endsAt: new Date(
        `2026-07-20T${String(hour + 1).padStart(2, '0')}:00:00Z`,
      ),
      procedure: 'Curativo',
      priceCents: 15000,
      professionalId,
    });

  describe('O3.1: conflito de agenda por profissional', () => {
    it('Dado mesmo horário e profissionais distintos, Quando agendar, Então ambos agendam', async () => {
      const joao = await new CreatePatient(patientRepo).execute({
        fullName: 'João Souza',
        email: 'joao@example.com',
        phone: '11988880000',
      });
      await schedule(9, 'prof-ana');

      await expect(schedule(9, 'prof-bruno', joao.id)).resolves.toBeTruthy();
    });

    it('Dado mesmo horário e mesmo profissional, Quando agendar, Então SchedulingConflictError', async () => {
      await schedule(9, 'prof-ana');

      const joao = await new CreatePatient(patientRepo).execute({
        fullName: 'João Souza',
        email: 'joao@example.com',
        phone: '11988880000',
      });
      await expect(schedule(9, 'prof-ana', joao.id)).rejects.toThrow(
        SchedulingConflictError,
      );
    });

    it('Dado consulta sem profissional, Quando outro tenta o horário, Então conflita (regra global)', async () => {
      await schedule(9, null);

      const joao = await new CreatePatient(patientRepo).execute({
        fullName: 'João Souza',
        email: 'joao@example.com',
        phone: '11988880000',
      });
      await expect(schedule(9, 'prof-ana', joao.id)).rejects.toThrow(
        SchedulingConflictError,
      );
    });
  });

  describe('O3.2: série recorrente', () => {
    const recurring = () =>
      new ScheduleRecurringAppointments(
        new ScheduleAppointment(appointmentRepo, patientRepo),
      ).execute({
        patientId: maria.id,
        startsAt: new Date('2026-07-20T09:00:00Z'),
        endsAt: new Date('2026-07-20T10:00:00Z'),
        procedure: 'Curativo',
        priceCents: 15000,
        occurrences: 4,
      });

    it('Dado série de 4 semanas livre, Quando agendar, Então cria 4 sessões', async () => {
      const result = await recurring();

      expect(result.created).toHaveLength(4);
      expect(result.skipped).toHaveLength(0);
      expect(result.created[1].slot.start.toISOString()).toBe(
        '2026-07-27T09:00:00.000Z',
      );
    });

    it('Dado conflito na 2ª ocorrência, Quando agendar série, Então pula só ela', async () => {
      // Ocupa a 2ª semana (27/07) com o mesmo profissional-nulo → conflito global.
      await new ScheduleAppointment(appointmentRepo, patientRepo).execute({
        patientId: maria.id,
        startsAt: new Date('2026-07-27T09:00:00Z'),
        endsAt: new Date('2026-07-27T10:00:00Z'),
        procedure: 'Outra',
        priceCents: 1000,
      });

      const result = await recurring();

      expect(result.created).toHaveLength(3);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].startsAt.toISOString()).toBe(
        '2026-07-27T09:00:00.000Z',
      );
    });

    it('Dado ocorrências fora de 2–24, Quando agendar, Então ValidationError', async () => {
      await expect(
        new ScheduleRecurringAppointments(
          new ScheduleAppointment(appointmentRepo, patientRepo),
        ).execute({
          patientId: maria.id,
          startsAt: new Date('2026-07-20T09:00:00Z'),
          endsAt: new Date('2026-07-20T10:00:00Z'),
          procedure: 'Curativo',
          priceCents: 15000,
          occurrences: 1,
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('O3.3: pacotes de sessões', () => {
    let invoiceRepo: InMemoryInvoiceRepository;
    let packageRepo: InMemorySessionPackageRepository;

    beforeEach(() => {
      invoiceRepo = new InMemoryInvoiceRepository();
      packageRepo = new InMemorySessionPackageRepository();
    });

    const scheduleWithProcedure = (hour: number) =>
      new ScheduleAppointment(appointmentRepo, patientRepo).execute({
        patientId: maria.id,
        startsAt: new Date(
          `2026-07-20T${String(hour).padStart(2, '0')}:00:00Z`,
        ),
        endsAt: new Date(
          `2026-07-20T${String(hour + 1).padStart(2, '0')}:00:00Z`,
        ),
        procedure: 'Curativo',
        priceCents: 15000,
        procedureId: 'proc-curativo',
      });

    const complete = (id: string) =>
      new CompleteAppointment(
        appointmentRepo,
        invoiceRepo,
        undefined,
        packageRepo,
      ).execute({
        id,
      });

    it('Dado pacote com saldo, Quando concluir consulta do procedimento, Então consome sessão e não fatura', async () => {
      const pkg = SessionPackage.create({
        patientId: maria.id,
        procedureId: 'proc-curativo',
        totalSessions: 10,
        priceCents: 120000,
      });
      await packageRepo.save(pkg);

      const appointment = await scheduleWithProcedure(9);
      await complete(appointment.id);

      const updated = await packageRepo.findById(pkg.id);
      expect(updated?.usedSessions).toBe(1);
      expect(await invoiceRepo.findByAppointmentId(appointment.id)).toBeNull();
    });

    it('Dado conclusão reparadora, Quando re-executar, Então não consome segunda sessão', async () => {
      const pkg = SessionPackage.create({
        patientId: maria.id,
        procedureId: 'proc-curativo',
        totalSessions: 10,
        priceCents: 120000,
      });
      await packageRepo.save(pkg);
      const appointment = await scheduleWithProcedure(9);

      await complete(appointment.id);
      await complete(appointment.id);

      expect((await packageRepo.findById(pkg.id))?.usedSessions).toBe(1);
      expect(await invoiceRepo.findByAppointmentId(appointment.id)).toBeNull();
    });

    it('Dado pacote expirado, Quando concluir, Então não consome e fatura avulso (COMP3-08)', async () => {
      const pkg = SessionPackage.create({
        patientId: maria.id,
        procedureId: 'proc-curativo',
        totalSessions: 10,
        priceCents: 120000,
        expiresAt: new Date('2026-01-01T00:00:00Z'),
      });
      await packageRepo.save(pkg);

      const appointment = await scheduleWithProcedure(13);
      await complete(appointment.id);

      expect((await packageRepo.findById(pkg.id))?.usedSessions).toBe(0);
      expect(
        await invoiceRepo.findByAppointmentId(appointment.id),
      ).not.toBeNull();
    });

    it('Dado pacote sem validade (null), Quando checar elegibilidade, Então comportamento atual preservado (COMP3-09)', () => {
      const semValidade = SessionPackage.create({
        patientId: maria.id,
        procedureId: 'proc-curativo',
        totalSessions: 2,
        priceCents: 20000,
      });
      const noPrazo = SessionPackage.create({
        patientId: maria.id,
        procedureId: 'proc-curativo',
        totalSessions: 2,
        priceCents: 20000,
        expiresAt: new Date('2030-01-01T00:00:00Z'),
      });
      const vencido = SessionPackage.create({
        patientId: maria.id,
        procedureId: 'proc-curativo',
        totalSessions: 2,
        priceCents: 20000,
        expiresAt: new Date('2020-01-01T00:00:00Z'),
      });
      const now = new Date('2026-07-20T12:00:00Z');

      expect(semValidade.expiresAt).toBeNull();
      expect(semValidade.isUsableAt(now)).toBe(true);
      expect(noPrazo.isUsableAt(now)).toBe(true);
      expect(vencido.isUsableAt(now)).toBe(false);
    });

    it('Dado pacote esgotado, Quando concluir, Então volta a faturar avulso', async () => {
      const pkg = SessionPackage.create({
        patientId: maria.id,
        procedureId: 'proc-curativo',
        totalSessions: 1,
        priceCents: 12000,
      });
      await packageRepo.save(pkg);

      const first = await scheduleWithProcedure(9);
      await complete(first.id);
      const second = await scheduleWithProcedure(11);
      await complete(second.id);

      expect(await invoiceRepo.findByAppointmentId(first.id)).toBeNull();
      expect(await invoiceRepo.findByAppointmentId(second.id)).not.toBeNull();
    });

    it('Dado pacote sem saldo, Quando consumir, Então ValidationError', () => {
      const pkg = SessionPackage.create({
        patientId: 'p',
        procedureId: 'x',
        totalSessions: 1,
        priceCents: 100,
      });
      expect(() => pkg.consumeSession().consumeSession()).toThrow(
        ValidationError,
      );
    });
  });

  describe('O3.4: produção e repasse', () => {
    it('Dado consultas concluídas por profissional, Quando agregar, Então produção correta', async () => {
      const invoiceRepo = new InMemoryInvoiceRepository();
      const a1 = await schedule(9, 'prof-ana');
      const a2 = await schedule(11, 'prof-ana');
      await schedule(14, null);
      const complete = new CompleteAppointment(appointmentRepo, invoiceRepo);
      await complete.execute({ id: a1.id });
      await complete.execute({ id: a2.id });

      const sessions = await new InMemoryProducedSessionRepository(
        appointmentRepo,
        invoiceRepo,
        new InMemorySessionPackageRepository(),
      ).findCompletedInRange(
        new Date('2026-07-01T00:00:00Z'),
        new Date('2026-08-01T00:00:00Z'),
      );
      const { byProfessional } = aggregateProduction(sessions, new Date());

      const ana = byProfessional.find((p) => p.professionalId === 'prof-ana');
      expect(ana?.count).toBe(2);
      expect(ana?.revenueCents).toBe(30000);
    });

    it('Dado percentual fora de 0–100, Quando criar profissional, Então ValidationError', () => {
      expect(() =>
        Professional.create({ fullName: 'Ana', commissionPct: 150 }),
      ).toThrow(ValidationError);
      expect(
        Professional.create({ fullName: 'Ana', commissionPct: 40 })
          .commissionPct,
      ).toBe(40);
    });
  });
});
