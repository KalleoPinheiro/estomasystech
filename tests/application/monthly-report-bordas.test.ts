import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

import { CompleteAppointment } from '@/application/appointments/complete-appointment';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { CreatePatient } from '@/application/patients/create-patient';
import {
  GetMonthlyReport,
  isReportSettled,
  type MonthlyReport,
} from '@/application/reports/get-monthly-report';
import { Professional } from '@/domain/professional/professional';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryProducedSessionRepository } from '@/infrastructure/persistence/in-memory/in-memory-produced-session-repository';
import { InMemoryProfessionalRepository } from '@/infrastructure/persistence/in-memory/in-memory-professional-repository';

const settled = {
  byStatus: { scheduled: 0, confirmed: 0 },
  billing: { pendingCount: 0 },
  productionByProfessional: [],
} as unknown as MonthlyReport;

const withStatus = (patch: Record<string, number>) =>
  ({
    ...settled,
    byStatus: { ...settled.byStatus, ...patch },
  }) as unknown as MonthlyReport;

describe('Feature: Relatório assentado só quando nada mais muda', () => {
  it('Dado relatório sem consulta aberta, fatura pendente ou comissão a liberar, Então está assentado', () => {
    expect(isReportSettled(settled)).toBe(true);
  });

  it('Dado consulta agendada, Então não está assentado', () => {
    expect(isReportSettled(withStatus({ scheduled: 1 }))).toBe(false);
  });

  it('Dado consulta confirmada, Então não está assentado', () => {
    expect(isReportSettled(withStatus({ confirmed: 1 }))).toBe(false);
  });

  it('Dado fatura pendente, Então não está assentado', () => {
    expect(
      isReportSettled({
        ...settled,
        billing: { pendingCount: 1 },
      } as unknown as MonthlyReport),
    ).toBe(false);
  });
});

describe('Feature: Relatório mensal — bordas de produção e no-show', () => {
  const range = {
    from: new Date('2026-07-01T00:00:00Z'),
    to: new Date('2026-08-01T00:00:00Z'),
  };

  const setup = async () => {
    const patientRepo = new InMemoryPatientRepository();
    const appointmentRepo = new InMemoryAppointmentRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();
    const professionalRepo = new InMemoryProfessionalRepository();
    const maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    const complete = async (
      day: string,
      priceCents: number,
      professionalId?: string,
    ) => {
      const appointment = await new ScheduleAppointment(
        appointmentRepo,
        patientRepo,
      ).execute({
        patientId: maria.id,
        startsAt: new Date(`2026-07-${day}T09:00:00Z`),
        endsAt: new Date(`2026-07-${day}T10:00:00Z`),
        procedure: `Procedimento ${day}`,
        priceCents,
        professionalId,
      });
      await new CompleteAppointment(appointmentRepo, invoiceRepo).execute({
        id: appointment.id,
      });
    };
    const report = (withProfessionals: boolean) =>
      new GetMonthlyReport(
        appointmentRepo,
        invoiceRepo,
        new InMemoryProducedSessionRepository(
          appointmentRepo,
          invoiceRepo,
          new InMemorySessionPackageRepository(),
        ),
        undefined,
        withProfessionals ? professionalRepo : undefined,
      ).execute(range);
    return { complete, report, professionalRepo };
  };

  it('Dado mês sem consultas, Quando gerar o relatório, Então a taxa de no-show é 0', async () => {
    const { report } = await setup();
    const result = await report(true);
    expect(result.totalAppointments).toBe(0);
    expect(result.noShowRate).toBe(0);
  });

  it('Dado consulta concluída sem profissional, Quando gerar o relatório, Então aparece como "Sem atribuição" sem comissão', async () => {
    const { complete, report } = await setup();
    await complete('20', 10000);

    const result = await report(true);

    expect(result.productionByProfessional).toHaveLength(1);
    expect(result.productionByProfessional[0]).toMatchObject({
      professionalId: null,
      professionalName: 'Sem atribuição',
      totalCents: 10000,
      commissionCents: null,
    });
  });

  it('Dado profissionais com receitas diferentes cadastrados do menor para o maior, Então a produção sai do maior para o menor', async () => {
    const { complete, report, professionalRepo } = await setup();
    const low = Professional.create({
      fullName: 'Dr. Baixo',
      commissionPct: 10,
    });
    const high = Professional.create({
      fullName: 'Dra. Alta',
      commissionPct: 10,
    });
    await professionalRepo.save(low);
    await professionalRepo.save(high);
    await complete('21', 10000, low.id);
    await complete('22', 50000, high.id);

    const result = await report(true);

    expect(
      result.productionByProfessional.map((p) => p.professionalName),
    ).toEqual(['Dra. Alta', 'Dr. Baixo']);
    expect(result.productionByProfessional.map((p) => p.totalCents)).toEqual([
      50000, 10000,
    ]);
  });

  it('Dado profissional na produção e relatório sem repositório de profissionais, Quando gerar, Então cai em "Sem atribuição"', async () => {
    const { complete, report, professionalRepo } = await setup();
    const ana = Professional.create({
      fullName: 'Dra. Ana',
      commissionPct: 20,
    });
    await professionalRepo.save(ana);
    await complete('23', 20000, ana.id);

    const result = await report(false);

    expect(result.productionByProfessional[0]?.professionalName).toBe(
      'Sem atribuição',
    );
    expect(result.productionByProfessional[0]?.commissionCents).toBeNull();
  });
});
