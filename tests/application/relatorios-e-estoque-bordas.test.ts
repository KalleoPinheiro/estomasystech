import { describe, expect, it } from 'vitest';
import { CompleteAppointment } from '@/application/appointments/complete-appointment';
import { DispenseProcedureKit } from '@/application/inventory/dispense-procedure-kit';
import { GetSupplyInsights } from '@/application/inventory/get-supply-insights';
import { FlagInvalidClinicCnpjs } from '@/application/platform/flag-invalid-clinic-cnpjs';
import {
  GetMonthlyReport,
  isReportSettled,
  type MonthlyReport,
} from '@/application/reports/get-monthly-report';
import { aggregateProduction } from '@/application/reports/production';
import type { ProducedSession } from '@/domain/billing/commission';
import type { ProcedureKitRepository } from '@/domain/catalog/procedure-kit';
import { Clinic } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import type {
  StockMovementRepository,
  SupplyBatchRepository,
  SupplyRepository,
} from '@/domain/inventory/inventory-repositories';
import { Supply } from '@/domain/inventory/supply';
import { SupplyBatch } from '@/domain/inventory/supply-batch';
import { NotFoundError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';
import { InMemoryProducedSessionRepository } from '@/infrastructure/persistence/in-memory/in-memory-produced-session-repository';

const NOW = new Date('2026-10-20T12:00:00Z');

describe('Feature: Relatório mensal e produção por profissional', () => {
  it('Dado profissional sem regra de repasse, Quando checar se o relatório está assentado, Então a falta de comissão pendente não o mantém aberto', () => {
    const report = {
      byStatus: { scheduled: 0, confirmed: 0 },
      billing: { pendingCount: 0 },
      productionByProfessional: [{ pendingCommissionCents: null }],
    } as unknown as MonthlyReport;

    expect(isReportSettled(report)).toBe(true);
    expect(
      isReportSettled({
        ...report,
        productionByProfessional: [{ pendingCommissionCents: 500 }],
      } as unknown as MonthlyReport),
    ).toBe(false);
  });

  it('Dado saída de estoque ligada a consulta que não existe mais, Quando gerar o relatório, Então o custo entra como não atribuído', async () => {
    const appointments = new InMemoryAppointmentRepository();
    const invoices = new InMemoryInvoiceRepository();
    const stockMovements = {
      getOutflowCostInRange: async () => [
        { appointmentId: 'consulta-apagada', totalCents: 700 },
      ],
    } as unknown as StockMovementRepository;

    const report = await new GetMonthlyReport(
      appointments,
      invoices,
      new InMemoryProducedSessionRepository(
        appointments,
        invoices,
        new InMemorySessionPackageRepository(),
      ),
      stockMovements,
    ).execute({
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-11-01T00:00:00Z'),
      now: NOW,
    });

    expect(report.unattributedSupplyCostCents).toBe(700);
    expect(report.totalSupplyCostCents).toBe(700);
  });

  it('Dado regra de repasse que só passa a valer na segunda sessão do profissional, Quando agregar a produção, Então o repasse começa do zero nessa sessão', () => {
    const session = (
      id: string,
      invoice: ProducedSession['invoice'],
    ): ProducedSession => ({
      appointmentId: id,
      professionalId: 'prof-1',
      procedure: 'Curativo',
      sessionDate: NOW,
      listPriceCents: 10000,
      invoice,
      package: null,
    });
    const rules = [
      null,
      { kind: 'percentage' as const, pct: 30 },
      { kind: 'percentage' as const, pct: 30 },
    ];
    let call = 0;

    const { byProfessional } = aggregateProduction(
      [
        session('a1', null),
        session('a2', null),
        session('a3', {
          status: 'pending',
          issuedAt: NOW,
          dueDate: null,
        }),
      ],
      NOW,
      () => rules[call++] ?? null,
    );

    expect(byProfessional[0]).toMatchObject({
      count: 3,
      releasedCommissionCents: 3000,
      pendingCommissionCents: 3000,
    });
  });
});

describe('Feature: Previsão de ruptura e lotes (O2)', () => {
  it('Dado consumo de insumo sem cadastro, consumo zero e lote de insumo sem cadastro, Quando consultar, Então não quebra e identifica pelo id', async () => {
    const supply = Supply.create({
      name: 'Bolsa 60mm',
      unit: 'un',
      minQty: 1,
      priceCents: 3500,
    });
    const batch = SupplyBatch.create({
      supplyId: 'insumo-sem-cadastro',
      quantity: 4,
      label: 'L-9',
      expiresAt: new Date('2026-11-01T00:00:00Z'),
    });
    const supplies = {
      findAll: async () => [supply],
    } as unknown as SupplyRepository;
    const movements = {
      getOutflowQtyInRange: async () => [
        { supplyId: 'insumo-sem-cadastro', totalQty: 90 },
        { supplyId: supply.id, totalQty: 0 },
      ],
    } as unknown as StockMovementRepository;
    const batches = {
      findExpiringBefore: async () => [batch],
    } as unknown as SupplyBatchRepository;

    const insights = await new GetSupplyInsights(
      supplies,
      movements,
      batches,
    ).execute(NOW);

    expect(insights.bySupply).toEqual([
      { supplyId: 'insumo-sem-cadastro', avgDailyOut: 1, daysToStockout: 0 },
      { supplyId: supply.id, avgDailyOut: 0, daysToStockout: null },
    ]);
    expect(insights.expiringBatches[0].supplyName).toBe('insumo-sem-cadastro');
  });

  it('Dado kit com insumo inexistente ou inativo, Quando concluir a consulta, Então avisa e segue sem bloquear', async () => {
    const kits = {
      getKit: async () => [{ supplyId: 'insumo-sumido', quantity: 1 }],
    } as unknown as ProcedureKitRepository;
    const supplies = {
      findById: async () => null,
    } as unknown as SupplyRepository;
    const movements = {
      findByAppointmentId: async () => [],
    } as unknown as StockMovementRepository;

    const result = await new DispenseProcedureKit(
      kits,
      supplies,
      movements,
      {} as never,
    ).execute({ appointmentId: 'a-1', procedureId: 'proc-1' });

    expect(result).toEqual({
      dispensed: 0,
      warnings: ['Insumo do kit indisponível (insumo-sumido)'],
      skipped: false,
    });
  });
});

describe('Feature: Saneamento de CNPJ e conclusão de consulta nas bordas', () => {
  it('Dado relógio não informado, Quando só listar CNPJs inválidos, Então lista sem gravar', async () => {
    const clinic = Clinic.restore({
      id: 'c-1',
      name: 'Antiga',
      createdBy: 'system',
      createdAt: NOW,
      cnpj: '12.345.678/0001-96',
    });
    const clinics = {
      findAll: async () => [clinic],
    } as unknown as ClinicRepository;

    const found = await new FlagInvalidClinicCnpjs(clinics, () => {
      throw new Error('não deveria auditar');
    }).execute({ apply: false });

    expect(found).toEqual([
      expect.objectContaining({ clinicId: 'c-1', flaggedNow: false }),
    ]);
  });

  it('Dado consulta inexistente, Quando concluir, Então recusa com não encontrada', async () => {
    const appointments = new InMemoryAppointmentRepository();
    const useCase = new CompleteAppointment(
      appointments,
      new InMemoryInvoiceRepository(),
    );

    await expect(useCase.execute({ id: 'fantasma' } as never)).rejects.toThrow(
      new NotFoundError('Consulta', 'fantasma'),
    );
  });
});
