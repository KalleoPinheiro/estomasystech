import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Fixtures do arquivo vivem em julho/2026, mas faturas e movimentos nascem com
// createdAt = "agora" (Invoice.create/StockMovement.create). Sem pinar o relógio,
// o relatório do mês fixo deixa de capturá-los a partir de agosto — suíte
// quebrava por sensibilidade à data corrente.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

import { CompleteAppointment } from '@/application/appointments/complete-appointment';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { CreateSupply } from '@/application/inventory/create-supply';
import { RegisterStockMovement } from '@/application/inventory/register-stock-movement';
import { CreatePatient } from '@/application/patients/create-patient';
import { GetMonthlyReport } from '@/application/reports/get-monthly-report';
import type { Supply } from '@/domain/inventory/supply';
import type { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import { NotFoundError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryStockMovementRepository,
  InMemorySupplyRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryProducedSessionRepository } from '@/infrastructure/persistence/in-memory/in-memory-produced-session-repository';
import { InMemoryProfessionalRepository } from '@/infrastructure/persistence/in-memory/in-memory-professional-repository';

// 2026-07-20 é segunda-feira; horários em UTC (testes rodam com TZ=UTC).
describe('Feature: Custo de insumos por atendimento e margem por procedimento', () => {
  let patientRepo: InMemoryPatientRepository;
  let appointmentRepo: InMemoryAppointmentRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let supplyRepo: InMemorySupplyRepository;
  let movementRepo: InMemoryStockMovementRepository;
  let maria: Patient;
  let bolsa: Supply;

  beforeEach(async () => {
    patientRepo = new InMemoryPatientRepository();
    appointmentRepo = new InMemoryAppointmentRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    supplyRepo = new InMemorySupplyRepository();
    movementRepo = new InMemoryStockMovementRepository();
    maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    bolsa = await new CreateSupply(supplyRepo).execute({
      name: 'Bolsa colostomia',
      unit: 'un',
      minQty: 5,
      priceCents: 4000,
    });
    await new RegisterStockMovement(supplyRepo, movementRepo).execute({
      supplyId: bolsa.id,
      type: 'in',
      quantity: 10,
      reason: 'Compra inicial',
    });
  });

  const scheduleAndComplete = async () => {
    const appointment = await new ScheduleAppointment(
      appointmentRepo,
      patientRepo,
    ).execute({
      patientId: maria.id,
      startsAt: new Date('2026-07-20T09:00:00Z'),
      endsAt: new Date('2026-07-20T10:00:00Z'),
      procedure: 'Troca de bolsa',
      priceCents: 25000,
    });
    await new CompleteAppointment(appointmentRepo, invoiceRepo).execute({
      id: appointment.id,
    });
    return appointment;
  };

  it('Dado saída vinculada à consulta, Quando gerar relatório, Então margem = receita − insumos', async () => {
    const appointment = await scheduleAndComplete();
    await new RegisterStockMovement(
      supplyRepo,
      movementRepo,
      appointmentRepo,
    ).execute({
      supplyId: bolsa.id,
      type: 'out',
      quantity: 2,
      reason: 'Uso em atendimento',
      appointmentId: appointment.id,
    });

    const report = await new GetMonthlyReport(
      appointmentRepo,
      invoiceRepo,
      new InMemoryProducedSessionRepository(
        appointmentRepo,
        invoiceRepo,
        new InMemorySessionPackageRepository(),
      ),
      movementRepo,
    ).execute({
      from: new Date('2026-07-01T00:00:00Z'),
      to: new Date('2026-08-01T00:00:00Z'),
    });

    const row = report.revenueByProcedure.find(
      (r) => r.procedure === 'Troca de bolsa',
    );
    expect(row?.totalCents).toBe(25000);
    expect(row?.supplyCostCents).toBe(8000);
    expect(row?.marginCents).toBe(17000);
    expect(report.unattributedSupplyCostCents).toBe(0);
  });

  it('Dado saída sem vínculo, Quando gerar relatório, Então entra como custo não atribuído', async () => {
    await scheduleAndComplete();
    await new RegisterStockMovement(supplyRepo, movementRepo).execute({
      supplyId: bolsa.id,
      type: 'out',
      quantity: 1,
      reason: 'Perda por validade',
    });

    const report = await new GetMonthlyReport(
      appointmentRepo,
      invoiceRepo,
      new InMemoryProducedSessionRepository(
        appointmentRepo,
        invoiceRepo,
        new InMemorySessionPackageRepository(),
      ),
      movementRepo,
    ).execute({
      from: new Date('2026-07-01T00:00:00Z'),
      to: new Date('2026-08-01T00:00:00Z'),
    });

    const row = report.revenueByProcedure.find(
      (r) => r.procedure === 'Troca de bolsa',
    );
    expect(row?.supplyCostCents).toBe(0);
    expect(report.unattributedSupplyCostCents).toBe(4000);
    expect(report.totalSupplyCostCents).toBe(4000);
  });

  it('Dado preço do insumo reajustado depois da saída, Quando gerar relatório, Então custo histórico não muda', async () => {
    const appointment = await scheduleAndComplete();
    await new RegisterStockMovement(
      supplyRepo,
      movementRepo,
      appointmentRepo,
    ).execute({
      supplyId: bolsa.id,
      type: 'out',
      quantity: 1,
      reason: 'Uso em atendimento',
      appointmentId: appointment.id,
    });

    const movements = await movementRepo.findBySupplyId(bolsa.id);
    const outflow = movements.find((m) => m.type === 'out');
    expect(outflow?.unitPriceCents).toBe(4000);
    expect(outflow?.totalCostCents).toBe(4000);
  });

  it('Dado consulta inexistente no vínculo, Quando registrar saída, Então NotFound', async () => {
    await expect(
      new RegisterStockMovement(
        supplyRepo,
        movementRepo,
        appointmentRepo,
      ).execute({
        supplyId: bolsa.id,
        type: 'out',
        quantity: 1,
        reason: 'Uso em atendimento',
        appointmentId: 'ghost',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('Dado dois profissionais com produção diferente, Quando gerar relatório, Então ordena por receita e calcula repasse', async () => {
    const professionalRepo = new InMemoryProfessionalRepository();
    const top = Professional.create({
      fullName: 'Dra. Ana',
      commissionPct: 20,
    });
    const secondary = Professional.create({
      fullName: 'Dr. Bruno',
      commissionPct: null,
    });
    await professionalRepo.save(top);
    await professionalRepo.save(secondary);

    const appt1 = await new ScheduleAppointment(
      appointmentRepo,
      patientRepo,
    ).execute({
      patientId: maria.id,
      startsAt: new Date('2026-07-21T09:00:00Z'),
      endsAt: new Date('2026-07-21T10:00:00Z'),
      procedure: 'Avaliação',
      priceCents: 30000,
      professionalId: top.id,
    });
    await new CompleteAppointment(appointmentRepo, invoiceRepo).execute({
      id: appt1.id,
    });

    const appt2 = await new ScheduleAppointment(
      appointmentRepo,
      patientRepo,
    ).execute({
      patientId: maria.id,
      startsAt: new Date('2026-07-22T09:00:00Z'),
      endsAt: new Date('2026-07-22T10:00:00Z'),
      procedure: 'Curativo',
      priceCents: 10000,
      professionalId: secondary.id,
    });
    await new CompleteAppointment(appointmentRepo, invoiceRepo).execute({
      id: appt2.id,
    });

    const report = await new GetMonthlyReport(
      appointmentRepo,
      invoiceRepo,
      new InMemoryProducedSessionRepository(
        appointmentRepo,
        invoiceRepo,
        new InMemorySessionPackageRepository(),
      ),
      movementRepo,
      professionalRepo,
    ).execute({
      from: new Date('2026-07-01T00:00:00Z'),
      to: new Date('2026-08-01T00:00:00Z'),
    });

    expect(report.productionByProfessional[0]?.professionalName).toBe(
      'Dra. Ana',
    );
    expect(report.productionByProfessional[0]?.commissionCents).toBe(6000);
    expect(report.productionByProfessional[1]?.professionalName).toBe(
      'Dr. Bruno',
    );
    expect(report.productionByProfessional[1]?.commissionCents).toBeNull();
  });
});
