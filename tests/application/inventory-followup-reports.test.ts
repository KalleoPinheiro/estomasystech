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

import { ChangeAppointmentStatus } from '@/application/appointments/change-appointment-status';
import { CompleteAppointment } from '@/application/appointments/complete-appointment';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { CreateFollowUp } from '@/application/followups/create-follow-up';
import { ListFollowUps } from '@/application/followups/list-follow-ups';
import { SetFollowUpStatus } from '@/application/followups/set-follow-up-status';
import { CreateSupply } from '@/application/inventory/create-supply';
import { ListSupplies } from '@/application/inventory/list-supplies';
import { RegisterStockMovement } from '@/application/inventory/register-stock-movement';
import { UpdateSupply } from '@/application/inventory/update-supply';
import { CreatePatient } from '@/application/patients/create-patient';
import { GetMonthlyReport } from '@/application/reports/get-monthly-report';
import { Supply } from '@/domain/inventory/supply';
import type { Patient } from '@/domain/patient/patient';
import { InsufficientStockError, NotFoundError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryFollowUpRepository,
  InMemoryStockMovementRepository,
  InMemorySupplyRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryProducedSessionRepository } from '@/infrastructure/persistence/in-memory/in-memory-produced-session-repository';

describe('Feature: Estoque de insumos', () => {
  let supplyRepo: InMemorySupplyRepository;
  let movementRepo: InMemoryStockMovementRepository;

  beforeEach(() => {
    supplyRepo = new InMemorySupplyRepository();
    movementRepo = new InMemoryStockMovementRepository();
  });

  const createBolsa = () =>
    new CreateSupply(supplyRepo).execute({
      name: 'Bolsa colostomia 60mm',
      unit: 'un',
      minQty: 10,
      priceCents: 3500,
    });

  it('Dado insumo, Quando registrar entrada, Então estoque sobe e movimentação auditada', async () => {
    const supply = await createBolsa();

    await new RegisterStockMovement(supplyRepo, movementRepo).execute({
      supplyId: supply.id,
      type: 'in',
      quantity: 50,
      reason: 'Compra fornecedor X',
    });

    expect((await supplyRepo.findById(supply.id))?.stockQty).toBe(50);
    expect(await movementRepo.findBySupplyId(supply.id)).toHaveLength(1);
  });

  it('Dado estoque 5, Quando dar saída de 6, Então lança InsufficientStockError e nada muda', async () => {
    const supply = await createBolsa();
    const useCase = new RegisterStockMovement(supplyRepo, movementRepo);
    await useCase.execute({
      supplyId: supply.id,
      type: 'in',
      quantity: 5,
      reason: 'Compra',
    });

    await expect(
      useCase.execute({
        supplyId: supply.id,
        type: 'out',
        quantity: 6,
        reason: 'Uso',
      }),
    ).rejects.toThrow(InsufficientStockError);

    expect((await supplyRepo.findById(supply.id))?.stockQty).toBe(5);
    expect(await movementRepo.findBySupplyId(supply.id)).toHaveLength(1);
  });

  it('Dado insumo inexistente, Quando movimentar, Então lança NotFoundError', async () => {
    await expect(
      new RegisterStockMovement(supplyRepo, movementRepo).execute({
        supplyId: 'ghost',
        type: 'in',
        quantity: 1,
        reason: 'x',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('Dado insumos, Quando listar, Então retorna com indicador de estoque baixo', async () => {
    const supply = await createBolsa();
    await new RegisterStockMovement(supplyRepo, movementRepo).execute({
      supplyId: supply.id,
      type: 'in',
      quantity: 8,
      reason: 'Compra',
    });

    const list = await new ListSupplies(supplyRepo).execute();

    expect(list).toHaveLength(1);
    expect(list[0].isLowStock).toBe(true);
  });

  it('Dado insumo, Quando atualizar preço/mínimo, Então persiste', async () => {
    const supply = await createBolsa();

    await new UpdateSupply(supplyRepo).execute({
      id: supply.id,
      priceCents: 4000,
      minQty: 5,
    });

    const stored = await supplyRepo.findById(supply.id);
    expect(stored?.priceCents).toBe(4000);
    expect(stored?.minQty).toBe(5);
  });
});

describe('Feature: Recall de retornos', () => {
  let patientRepo: InMemoryPatientRepository;
  let appointmentRepo: InMemoryAppointmentRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let followUpRepo: InMemoryFollowUpRepository;
  let maria: Patient;

  beforeEach(async () => {
    patientRepo = new InMemoryPatientRepository();
    appointmentRepo = new InMemoryAppointmentRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    followUpRepo = new InMemoryFollowUpRepository();
    maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
  });

  const schedule = () =>
    new ScheduleAppointment(appointmentRepo, patientRepo).execute({
      patientId: maria.id,
      startsAt: new Date('2026-07-20T09:00:00Z'),
      endsAt: new Date('2026-07-20T10:00:00Z'),
      procedure: 'Troca de bolsa',
      priceCents: 25000,
    });

  it('Dado conclusão com followUpInDays=30, Quando concluir, Então cria retorno pendente 30 dias após a consulta', async () => {
    const appointment = await schedule();

    await new CompleteAppointment(
      appointmentRepo,
      invoiceRepo,
      followUpRepo,
    ).execute({
      id: appointment.id,
      followUpInDays: 30,
    });

    const followUps = await followUpRepo.findAll({ status: 'pending' });
    expect(followUps).toHaveLength(1);
    expect(followUps[0].dueDate).toEqual(new Date('2026-08-19T10:00:00Z'));
    expect(followUps[0].reason).toContain('Troca de bolsa');
  });

  it('Dado conclusão sem followUpInDays, Quando concluir, Então nenhum retorno criado', async () => {
    const appointment = await schedule();

    await new CompleteAppointment(
      appointmentRepo,
      invoiceRepo,
      followUpRepo,
    ).execute({
      id: appointment.id,
    });

    expect(await followUpRepo.findAll()).toHaveLength(0);
  });

  it('Dado retorno manual, Quando criar e listar, Então retorna com nome do paciente e atraso', async () => {
    await new CreateFollowUp(followUpRepo, patientRepo).execute({
      patientId: maria.id,
      dueDate: new Date('2026-07-01T12:00:00Z'),
      reason: 'Reavaliação de ferida',
    });

    const list = await new ListFollowUps(followUpRepo, patientRepo).execute({
      status: 'pending',
      now: new Date('2026-07-16T00:00:00Z'),
    });

    expect(list).toHaveLength(1);
    expect(list[0].patientName).toBe('Maria da Silva');
    expect(list[0].isOverdue).toBe(true);
  });

  it('Dado retorno pendente, Quando marcar done/cancelled, Então persiste transição', async () => {
    const followUp = await new CreateFollowUp(
      followUpRepo,
      patientRepo,
    ).execute({
      patientId: maria.id,
      dueDate: new Date('2026-08-01T12:00:00Z'),
      reason: 'Retorno',
    });

    await new SetFollowUpStatus(followUpRepo).execute({
      id: followUp.id,
      status: 'done',
    });

    expect((await followUpRepo.findById(followUp.id))?.status).toBe('done');
    await expect(
      new SetFollowUpStatus(followUpRepo).execute({
        id: 'ghost',
        status: 'done',
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('Feature: Baixa de estoque anti-corrida (CONS2-06/08)', () => {
  it('Dado snapshot com saldo mas adjustStock nulo (corrida), Quando registrar saída, Então InsufficientStockError e nenhuma movimentação salva', async () => {
    // Cenário de corrida: entre o findById (snapshot com saldo) e a aplicação
    // atômica, outro processo consumiu o estoque — adjustStock retorna null.
    const supplyRepo = new InMemorySupplyRepository();
    const movementRepo = new InMemoryStockMovementRepository();
    const supply = Supply.create({
      name: 'Gaze corrida',
      unit: 'un',
      minQty: 1,
      priceCents: 100,
    });
    await supplyRepo.save(supply.registerEntry(10));
    const adjustSpy = vi
      .spyOn(supplyRepo, 'adjustStock')
      .mockResolvedValue(null);

    await expect(
      new RegisterStockMovement(supplyRepo, movementRepo).execute({
        supplyId: supply.id,
        type: 'out',
        quantity: 3,
        reason: 'Kit do procedimento',
      }),
    ).rejects.toThrow(InsufficientStockError);

    expect(await movementRepo.findBySupplyId(supply.id)).toHaveLength(0);
    expect((await supplyRepo.findById(supply.id))?.stockQty).toBe(10);
    adjustSpy.mockRestore();
  });
});

describe('Feature: Relatório gerencial mensal', () => {
  it('Dado consultas e faturas do mês, Quando gerar relatório, Então totaliza status, no-show e receita por procedimento', async () => {
    const patientRepo = new InMemoryPatientRepository();
    const appointmentRepo = new InMemoryAppointmentRepository();
    const invoiceRepo = new InMemoryInvoiceRepository();
    const maria = await new CreatePatient(patientRepo).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });

    const schedule = (
      day: number,
      hour: number,
      procedure: string,
      priceCents: number,
    ) =>
      new ScheduleAppointment(appointmentRepo, patientRepo).execute({
        patientId: maria.id,
        startsAt: new Date(Date.UTC(2026, 6, day, hour)),
        endsAt: new Date(Date.UTC(2026, 6, day, hour + 1)),
        procedure,
        priceCents,
      });

    // 2 concluídas (troca de bolsa), 1 concluída (curativo), 1 falta, 1 cancelada
    const a1 = await schedule(20, 9, 'Troca de bolsa', 25000);
    const a2 = await schedule(21, 9, 'Troca de bolsa', 25000);
    const a3 = await schedule(22, 9, 'Curativo', 15000);
    const a4 = await schedule(23, 9, 'Troca de bolsa', 25000);
    const a5 = await schedule(24, 9, 'Curativo', 15000);

    const complete = new CompleteAppointment(appointmentRepo, invoiceRepo);
    await complete.execute({ id: a1.id });
    await complete.execute({ id: a2.id });
    await complete.execute({ id: a3.id });
    const change = new ChangeAppointmentStatus(appointmentRepo);
    await change.execute({ id: a4.id, action: 'no_show' });
    await change.execute({ id: a5.id, action: 'cancel' });

    const report = await new GetMonthlyReport(
      appointmentRepo,
      invoiceRepo,
      new InMemoryProducedSessionRepository(
        appointmentRepo,
        invoiceRepo,
        new InMemorySessionPackageRepository(),
      ),
    ).execute({
      from: new Date('2026-07-01T00:00:00Z'),
      to: new Date('2026-08-01T00:00:00Z'),
    });

    expect(report.totalAppointments).toBe(5);
    expect(report.byStatus.completed).toBe(3);
    expect(report.byStatus.no_show).toBe(1);
    expect(report.byStatus.cancelled).toBe(1);
    // no-show sobre não-canceladas: 1/4
    expect(report.noShowRate).toBeCloseTo(0.25);
    expect(report.revenueByProcedure).toEqual([
      {
        procedure: 'Troca de bolsa',
        count: 2,
        totalCents: 50000,
        supplyCostCents: 0,
        supplyCostKnown: false,
        marginCents: 50000,
      },
      {
        procedure: 'Curativo',
        count: 1,
        totalCents: 15000,
        supplyCostCents: 0,
        supplyCostKnown: false,
        marginCents: 15000,
      },
    ]);
    expect(report.billing.pendingCents).toBe(65000);
  });
});
