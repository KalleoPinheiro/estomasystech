import { beforeEach, describe, expect, it } from 'vitest';
import {
  CancelPayout,
  ClosePayout,
  GetPayoutOverview,
  GetPayoutStatement,
} from '@/application/billing/payouts';
import { Invoice } from '@/domain/billing/invoice';
import { Professional } from '@/domain/professional/professional';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryCommissionPayoutRepository } from '@/infrastructure/persistence/in-memory/in-memory-commission-payout-repository';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemorySessionPackageRepository } from '@/infrastructure/persistence/in-memory/in-memory-package-repository';
import { InMemoryProducedSessionRepository } from '@/infrastructure/persistence/in-memory/in-memory-produced-session-repository';
import { InMemoryProfessionalRepository } from '@/infrastructure/persistence/in-memory/in-memory-professional-repository';
import { buildAppointment } from '../support/builders';

const NOW = new Date('2026-10-15T12:00:00');

describe('Feature: Fechamento mensal de repasses (casos de uso)', () => {
  let appointments: InMemoryAppointmentRepository;
  let invoices: InMemoryInvoiceRepository;
  let professionals: InMemoryProfessionalRepository;
  let payouts: InMemoryCommissionPayoutRepository;
  let deps: {
    professionals: InMemoryProfessionalRepository;
    producedSessions: InMemoryProducedSessionRepository;
    payouts: InMemoryCommissionPayoutRepository;
  };
  let ana: Professional;

  beforeEach(async () => {
    appointments = new InMemoryAppointmentRepository();
    invoices = new InMemoryInvoiceRepository();
    professionals = new InMemoryProfessionalRepository();
    payouts = new InMemoryCommissionPayoutRepository();
    deps = {
      professionals,
      producedSessions: new InMemoryProducedSessionRepository(
        appointments,
        invoices,
        new InMemorySessionPackageRepository(),
      ),
      payouts,
    };
    ana = Professional.create({ fullName: 'Dra. Ana', commissionPct: 40 });
    await professionals.save(ana);
  });

  /** Sessão concluída no dia indicado de 2026, com fatura paga ou pendente. */
  const session = async (
    isoDay: string,
    invoiceStatus: 'paid' | 'pending',
    professionalId = ana.id,
  ) => {
    const appointment = buildAppointment({
      professionalId,
      slot: TimeSlot.create(
        new Date(`${isoDay}T12:00:00`),
        new Date(`${isoDay}T13:00:00`),
      ),
      price: Money.fromCents(15000),
    }).complete();
    await appointments.save(appointment);
    const invoice = Invoice.create({
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      description: 'Curativo',
      amount: Money.fromCents(15000),
    });
    await invoices.save(
      invoiceStatus === 'paid' ? invoice.markPaid('pix', NOW) : invoice,
    );
    return { appointment, invoice };
  };

  const close = (period = '2026-09', professionalId = ana.id) =>
    new ClosePayout(deps).execute({
      professionalId,
      period,
      paidAt: NOW,
      paymentMethod: 'pix',
      createdBy: 'admin@clinica.com',
      now: NOW,
    });

  it('Dadas sessões liberadas e pendentes, Quando fechar setembro, Então paga só as liberadas e congela os itens', async () => {
    await session('2026-09-10', 'paid');
    await session('2026-09-11', 'paid');
    await session('2026-09-12', 'pending');

    const payout = await close();

    expect(payout.totalCents).toBe(12000);
    expect(payout.items).toHaveLength(2);
    const statement = await new GetPayoutStatement(deps).execute({
      professionalId: ana.id,
      period: '2026-09',
      now: NOW,
    });
    expect(statement.closedPayout?.id).toBe(payout.id);
    expect(statement.statement.payable).toEqual([]);
    expect(statement.statement.pendingCents).toBe(6000);
  });

  it('Dado mês já fechado, Quando fechar de novo, Então ConflictError', async () => {
    await session('2026-09-10', 'paid');
    await close();

    await expect(close()).rejects.toThrow(ConflictError);
  });

  it('Dado mês corrente, Quando fechar, Então recusa (só mês encerrado)', async () => {
    await session('2026-10-01', 'paid');

    await expect(close('2026-10')).rejects.toThrow(/depois que ele terminar/);
  });

  it('Dado profissional sem regra, Quando fechar, Então recusa com mensagem clara', async () => {
    const semRegra = Professional.create({ fullName: 'Dr. Sem Regra' });
    await professionals.save(semRegra);
    await session('2026-09-10', 'paid', semRegra.id);

    await expect(close('2026-09', semRegra.id)).rejects.toThrow(
      /não tem regra de repasse/,
    );
  });

  it('Dado nada liberado, Quando fechar, Então ValidationError', async () => {
    await session('2026-09-10', 'pending');

    await expect(close()).rejects.toThrow(ValidationError);
  });

  it('Dado profissional inexistente, Quando consultar extrato, Então NotFoundError', async () => {
    await expect(
      new GetPayoutStatement(deps).execute({
        professionalId: 'ghost',
        period: '2026-09',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('Dada sessão de setembro paga só em outubro, Quando fechar outubro, Então entra no fechamento de outubro', async () => {
    await session('2026-09-10', 'paid');
    const late = await session('2026-09-20', 'pending');
    await close('2026-09');

    await invoices.save(late.invoice.markPaid('pix', NOW));
    const october = await new ClosePayout(deps).execute({
      professionalId: ana.id,
      period: '2026-10',
      paidAt: new Date('2026-11-05T12:00:00'),
      paymentMethod: 'transfer',
      createdBy: 'admin@clinica.com',
      now: new Date('2026-11-05T12:00:00'),
    });

    expect(october.items.map((i) => i.appointmentId)).toEqual([
      late.appointment.id,
    ]);
    expect(october.totalCents).toBe(6000);
  });

  /** Fatura paga não cancela no domínio; simula um reembolso trocando a
   * fatura da consulta por uma cancelada. */
  const refund = async (target: Awaited<ReturnType<typeof session>>) =>
    invoices.save(
      Invoice.restore({
        id: target.invoice.id,
        patientId: target.appointment.patientId,
        appointmentId: target.appointment.id,
        description: 'Curativo',
        amount: Money.fromCents(15000),
        status: 'cancelled',
        issuedAt: NOW,
        paidAt: null,
        paymentMethod: null,
        dueDate: null,
        sessionPackageId: null,
      }),
    );

  const closeOctober = () =>
    new ClosePayout(deps).execute({
      professionalId: ana.id,
      period: '2026-10',
      paidAt: new Date('2026-11-05T12:00:00'),
      paymentMethod: 'pix',
      createdBy: 'admin@clinica.com',
      now: new Date('2026-11-05T12:00:00'),
    });

  it('Dada fatura cancelada após o repasse, Quando fechar o mês seguinte, Então o estorno é descontado', async () => {
    const refunded = await session('2026-09-10', 'paid');
    await close('2026-09');
    await refund(refunded);
    await session('2026-10-05', 'paid');
    await session('2026-10-06', 'paid');

    const october = await closeOctober();

    // 2 × 6000 de outubro − 6000 de estorno da sessão de setembro.
    expect(october.totalCents).toBe(6000);
    expect(october.items).toContainEqual(
      expect.objectContaining({
        appointmentId: refunded.appointment.id,
        kind: 'reversal',
        commissionCents: -6000,
      }),
    );
  });

  it('Dado estorno maior que o saldo do mês, Quando fechar, Então recusa e o estorno aguarda o próximo fechamento', async () => {
    const refunded = await session('2026-09-10', 'paid');
    await close('2026-09');
    await refund(refunded);
    await session('2026-10-05', 'paid');

    await expect(closeOctober()).rejects.toThrow(/zero ou negativo/);
  });

  it('Dado profissional de valor fixo, Quando fechar, Então cada sessão vale o fixo', async () => {
    const caio = Professional.create({
      fullName: 'Dr. Caio',
      commissionType: 'fixed',
      commissionFixedCents: 5000,
    });
    await professionals.save(caio);
    await session('2026-09-10', 'paid', caio.id);
    await session('2026-09-11', 'paid', caio.id);

    const payout = await close('2026-09', caio.id);

    expect(payout.totalCents).toBe(10000);
  });

  it('Dado o mês, Quando pedir a visão geral, Então lista profissionais ativos com saldo e fechamento', async () => {
    const inativo = Professional.create({
      fullName: 'Inativo',
      commissionPct: 10,
    }).deactivate();
    await professionals.save(inativo);
    await session('2026-09-10', 'paid');

    const rows = await new GetPayoutOverview(deps).execute({
      period: '2026-09',
      now: NOW,
    });

    expect(rows.map((r) => r.professional.fullName)).toEqual(['Dra. Ana']);
    expect(rows[0].statement.payableCents).toBe(6000);
    expect(rows[0].closedPayout).toBeNull();
  });

  describe('Cancelar repasse registrado por engano', () => {
    const cancel = (payoutId: string, reason = 'valor errado') =>
      new CancelPayout(payouts).execute({
        payoutId,
        reason,
        cancelledBy: 'admin@clinica.com',
        now: NOW,
      });

    it('Dado repasse fechado, Quando cancelar, Então as sessões voltam ao saldo e o mês pode ser fechado de novo', async () => {
      await session('2026-09-10', 'paid');
      const first = await close();

      const cancelled = await cancel(first.id);

      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledAt).toEqual(NOW);
      const statement = await new GetPayoutStatement(deps).execute({
        professionalId: ana.id,
        period: '2026-09',
        now: NOW,
      });
      expect(statement.closedPayout).toBeNull();
      expect(statement.statement.payableCents).toBe(6000);

      const again = await close();
      expect(again.totalCents).toBe(6000);
      expect(again.id).not.toBe(first.id);
      // O cancelado continua no histórico.
      const history = await payouts.findAll({ professionalId: ana.id });
      expect(history.map((p) => p.status).sort()).toEqual([
        'active',
        'cancelled',
      ]);
    });

    it('Dado repasse cancelado, Quando pedir a visão geral, Então o mês aparece em aberto', async () => {
      await session('2026-09-10', 'paid');
      await cancel((await close()).id);

      const [row] = await new GetPayoutOverview(deps).execute({
        period: '2026-09',
        now: NOW,
      });
      expect(row.closedPayout).toBeNull();
      expect(row.statement.payableCents).toBe(6000);
    });

    it('Dados dois repasses do profissional, Quando cancelar o mais antigo, Então ConflictError apontando o mais recente', async () => {
      await session('2026-09-10', 'paid');
      const september = await close('2026-09');
      await session('2026-10-05', 'paid');
      const october = await closeOctober();

      await expect(cancel(september.id)).rejects.toThrow(
        /cancele antes o de 2026-10/,
      );

      await cancel(october.id);
      const reopened = await cancel(september.id);
      expect(reopened.status).toBe('cancelled');
    });

    it('Dado repasse de outro profissional mais recente, Quando cancelar, Então não bloqueia', async () => {
      const caio = Professional.create({ fullName: 'Caio', commissionPct: 10 });
      await professionals.save(caio);
      await session('2026-09-10', 'paid');
      const anaPayout = await close('2026-09');
      await session('2026-10-05', 'paid', caio.id);
      await new ClosePayout(deps).execute({
        professionalId: caio.id,
        period: '2026-10',
        paidAt: NOW,
        paymentMethod: 'pix',
        createdBy: 'admin@clinica.com',
        now: new Date('2026-11-05T12:00:00'),
      });

      expect((await cancel(anaPayout.id)).status).toBe('cancelled');
    });

    it('Dado repasse inexistente ou já cancelado, Quando cancelar, Então recusa', async () => {
      await expect(cancel('ghost')).rejects.toThrow(NotFoundError);
      await session('2026-09-10', 'paid');
      const payout = await close();
      await cancel(payout.id);

      await expect(cancel(payout.id)).rejects.toThrow(/já foi cancelado/);
    });
  });
});
