import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import {
  CommissionPayout,
  type PayoutItem,
} from '@/domain/billing/commission-payout';
import { Invoice } from '@/domain/billing/invoice';
import { SessionPackage } from '@/domain/billing/package';
import { Guardian } from '@/domain/guardian/guardian';
import { StockMovement } from '@/domain/inventory/stock-movement';
import { SupplyBatch } from '@/domain/inventory/supply-batch';
import { ReminderLog } from '@/domain/messaging/reminder-log';
import { Appointment } from '@/domain/scheduling/appointment';
import { ConflictError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import { InMemoryCommissionPayoutRepository } from '@/infrastructure/persistence/in-memory/in-memory-commission-payout-repository';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import {
  InMemoryStockMovementRepository,
  InMemorySupplyBatchRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';
import { InMemoryProducedSessionRepository } from '@/infrastructure/persistence/in-memory/in-memory-produced-session-repository';
import { InMemoryReminderLogRepository } from '@/infrastructure/persistence/in-memory/in-memory-reminder-log-repository';

const T1 = new Date('2026-10-01T10:00:00Z');

describe('Feature: Repositórios em memória espelham os desempates e filtros do banco', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T1);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Dado faturas emitidas no mesmo instante, Quando listar, Então desempata pelo id, da maior para a menor', async () => {
    const repo = new InMemoryInvoiceRepository();
    const make = () =>
      Invoice.create({
        patientId: 'p1',
        description: 'Curativo',
        amount: Money.fromCents(10000),
      });
    const a = make();
    const b = make();
    await repo.save(a);
    await repo.save(b);

    const ids = (await repo.findAll()).map((i) => i.id);

    expect(ids).toEqual([a.id, b.id].sort((x, y) => y.localeCompare(x)));
  });

  it('Dado dois lotes sem validade criados no mesmo instante, Quando listar os ativos, Então a ordem é estável', async () => {
    const repo = new InMemorySupplyBatchRepository();
    await repo.save(SupplyBatch.create({ supplyId: 's1', quantity: 1 }));
    await repo.save(SupplyBatch.create({ supplyId: 's1', quantity: 2 }));

    expect(await repo.findActiveBySupplyId('s1')).toHaveLength(2);
  });

  it('Dado saída de insumo sem consulta, Quando somar custo no período, Então agrupa sob consulta nula', async () => {
    const repo = new InMemoryStockMovementRepository();
    await repo.save(
      StockMovement.create({
        supplyId: 's1',
        type: 'out',
        quantity: 1,
        reason: 'Perda',
        unitPriceCents: 700,
      }),
    );

    const custo = await repo.getOutflowCostInRange(
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-11-01T00:00:00Z'),
    );

    expect(custo).toEqual([{ appointmentId: null, totalCents: 700 }]);
  });

  it('Dado consulta paga por pacote, Quando ler a produção, Então traz a fatura do pacote; consulta avulsa vem sem pacote', async () => {
    const appointments = new InMemoryAppointmentRepository();
    const invoices = new InMemoryInvoiceRepository();
    const packages = new InMemorySessionPackageRepository();
    const production = new InMemoryProducedSessionRepository(
      appointments,
      invoices,
      packages,
    );
    const done = (hour: number) =>
      Appointment.create({
        patientId: 'p1',
        slot: TimeSlot.create(
          new Date(Date.UTC(2026, 9, 20, hour)),
          new Date(Date.UTC(2026, 9, 20, hour + 1)),
        ),
        procedure: 'Curativo',
        price: Money.fromCents(15000),
      })
        .confirm()
        .complete();
    const coberta = done(9);
    const avulsa = done(11);
    await appointments.save(coberta);
    await appointments.save(avulsa);
    const pkg = SessionPackage.create({
      patientId: 'p1',
      procedureId: 'proc1',
      totalSessions: 5,
      priceCents: 60000,
    });
    await packages.save(pkg);
    await packages.recordConsumption(pkg.id, coberta.id);
    await invoices.save(
      Invoice.create({
        patientId: 'p1',
        description: 'Pacote',
        amount: Money.fromCents(60000),
        sessionPackageId: pkg.id,
      }),
    );

    const sessions = await production.findCompletedInRange(
      new Date('2026-10-20T00:00:00Z'),
      new Date('2026-10-21T00:00:00Z'),
    );

    const daCoberta = sessions.find((s) => s.appointmentId === coberta.id);
    const daAvulsa = sessions.find((s) => s.appointmentId === avulsa.id);
    expect(daCoberta?.package?.priceCents).toBe(60000);
    expect(daCoberta?.package?.invoice?.status).toBe('pending');
    expect(daAvulsa?.package).toBeNull();
  });

  it('Dado recall por e-mail com duas tentativas no mesmo dia, Quando buscar o primeiro envio, Então fica a tentativa mais antiga', async () => {
    const repo = new InMemoryReminderLogRepository();
    vi.setSystemTime(T1);
    await repo.save(ReminderLog.create('recall', 'fu-1', T1, { attempt: 1 }));
    vi.setSystemTime(new Date('2026-10-01T15:00:00Z'));
    await repo.save(ReminderLog.create('recall', 'fu-1', T1, { attempt: 2 }));

    const first = await repo.firstSentAt(
      'recall',
      'email',
      ['fu-1'],
      ReminderLog.create('recall', 'fu-1', T1).sentOn,
    );

    expect(first.get('fu-1')).toEqual(T1);
  });

  it('Dado trilha de auditoria, Quando filtrar por recurso, Então só devolve o recurso pedido', async () => {
    const repo = new InMemoryAuditEventRepository('clinic-a');
    const make = (resourceId: string) =>
      AuditEvent.create({
        clinicId: 'clinic-a',
        actorRole: 'admin',
        actorId: 'staff',
        action: 'read',
        resourceType: 'document',
        resourceId,
      });
    const alvo = make('doc-1');
    await repo.save(alvo);
    await repo.save(make('doc-2'));

    const found = await repo.findAll({
      resourceType: 'document',
      resourceId: 'doc-1',
    });

    expect(found.map((e) => e.id)).toEqual([alvo.id]);
  });

  it('Dado responsável sem e-mail, Quando buscar por texto que não casa, Então não aparece', async () => {
    const repo = new InMemoryGuardianRepository();
    await repo.save(
      Guardian.create({
        fullName: 'Ana Souza',
        relationship: 'cuidador',
        phone: '11999990000',
      }),
    );

    expect(await repo.findAll('@clinica')).toEqual([]);
  });

  it('Dado mês já fechado para o profissional, Quando fechar de novo, Então recusa por conflito', async () => {
    const repo = new InMemoryCommissionPayoutRepository();
    const item = (appointmentId: string): PayoutItem => ({
      appointmentId,
      kind: 'session',
      procedure: 'Troca de bolsa',
      sessionDate: T1,
      baseCents: 25000,
      commissionCents: 5000,
    });
    const make = (appointmentId: string) =>
      CommissionPayout.create({
        professionalId: 'prof-1',
        period: '2026-09',
        paidAt: T1,
        paymentMethod: 'pix',
        createdBy: 'admin@clinica.com',
        rule: null,
        items: [item(appointmentId)],
      });
    await repo.save(make('ap-1'));

    await expect(repo.save(make('ap-2'))).rejects.toBeInstanceOf(ConflictError);
  });
  it('Dado ids de responsáveis em que um não existe, Quando buscar por ids, Então devolve só os existentes', async () => {
    const repo = new InMemoryGuardianRepository();
    const ana = Guardian.create({
      fullName: 'Ana Souza',
      relationship: 'cuidador',
      phone: '11999990000',
    });
    await repo.save(ana);

    const found = await repo.findByIds([ana.id, 'inexistente']);

    expect(found.map((g) => g.id)).toEqual([ana.id]);
  });

  it('Dado consumo registrado para um pacote que não existe mais, Quando perguntar o pacote da consulta, Então devolve nulo', async () => {
    const repo = new InMemorySessionPackageRepository();
    await repo.recordConsumption('pacote-removido', 'ap1');

    expect(repo.consumedBy('ap1')).toBeNull();
  });
});
