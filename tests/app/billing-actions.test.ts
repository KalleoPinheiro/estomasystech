import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { payoutPaidAt } from '@/lib/server/payout-input';
import { buildPatient, buildProcedure } from '../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };
const refreshed = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));

const signIn = (
  role: Parameters<typeof sessionToken>[0],
  clinicId: string = CLINIC_A_ID,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    clinicId,
  );
};

const billing = () => import('@/app/(staff)/faturamento/billing-actions');
const payouts = () => import('@/app/(staff)/repasses/payout-actions');

const repos = () => getRepositories(clinicScope(CLINIC_A_ID));

const auditOf = async (resourceId: string) => {
  const { auditEvents } = await repos();
  return (await auditEvents.findAll()).filter(
    (event) => event.resourceId === resourceId,
  );
};

const seedPatient = async () => {
  const { patients } = await repos();
  const patient = buildPatient();
  await patients.save(patient);
  return patient;
};

const seedInvoice = async (amountCents = 15_000) => {
  const patient = await seedPatient();
  signIn('company_admin');
  const { createInvoice } = await billing();
  const created = await createInvoice({
    patientId: patient.id,
    description: 'Sessão avulsa',
    amountCents,
  });
  if (!created.success) throw new Error(created.error);
  refreshed.mockClear();
  return { patient, invoice: created.data };
};

beforeEach(async () => {
  await ensureTestClinics();
  cookieStore.value = undefined;
  refreshed.mockClear();
});

describe('Feature: ações do Faturamento (#547)', () => {
  describe('Cenário: quem pode agir', () => {
    it('Dado que não há sessão, Quando emite uma fatura, Então responde Não autenticado e nada é gravado', async () => {
      const patient = await seedPatient();
      const { invoices } = await repos();
      const { createInvoice } = await billing();

      const result = await createInvoice({
        patientId: patient.id,
        description: 'Sessão avulsa',
        amountCents: 15_000,
      });

      expect(result.error).toBe('Não autenticado');
      expect(await invoices.findAll({ patientId: patient.id })).toHaveLength(0);
      expect(refreshed).not.toHaveBeenCalled();
    });

    it.each(['atendente', 'profissional'] as const)(
      'Dado o papel %s, Quando tenta emitir, receber e vender, Então é recusado e nada é gravado nem auditado',
      async (role) => {
        const { invoice, patient } = await seedInvoice();
        const procedure = buildProcedure();
        await (await repos()).procedures.save(procedure);
        signIn(role);
        const { createInvoice, updateInvoice, sellPackage } = await billing();

        const results = [
          await createInvoice({
            patientId: patient.id,
            description: 'Outra',
            amountCents: 1000,
          }),
          await updateInvoice({
            id: invoice.id,
            change: { action: 'pay', method: 'pix' },
          }),
          await sellPackage({
            patientId: patient.id,
            procedureId: procedure.id,
            totalSessions: 3,
            priceCents: 3000,
          }),
        ];

        expect(results.every((r) => !r.success)).toBe(true);
        const { invoices, sessionPackages } = await repos();
        expect((await invoices.findById(invoice.id))?.status).toBe('pending');
        expect(await invoices.findAll({ patientId: patient.id })).toHaveLength(
          1,
        );
        expect(await sessionPackages.findByPatientId(patient.id)).toHaveLength(
          0,
        );
        expect(refreshed).not.toHaveBeenCalled();
      },
    );

    it.each(['patient', 'partner'] as const)(
      'Dado o papel de portal %s, Quando tenta receber, Então é recusado',
      async (role) => {
        const { invoice } = await seedInvoice();
        signIn(role);
        const { updateInvoice } = await billing();

        const result = await updateInvoice({
          id: invoice.id,
          change: { action: 'pay', method: 'pix' },
        });

        expect(result.success).toBe(false);
        expect(
          (await (await repos()).invoices.findById(invoice.id))?.status,
        ).toBe('pending');
      },
    );
  });

  describe('Cenário: emitir fatura', () => {
    it('Dado o Admin, Quando emite a fatura, Então grava, audita sem a descrição e atualiza a tela', async () => {
      const patient = await seedPatient();
      signIn('company_admin');
      const { createInvoice } = await billing();

      const result = await createInvoice({
        patientId: patient.id,
        description: 'Curativo especializado',
        amountCents: 23_400,
        dueDate: '2026-12-01T12:00:00.000Z',
      });

      expect(result.success).toBe(true);
      const created = result.data as NonNullable<typeof result.data>;
      expect(created).toMatchObject({
        patientId: patient.id,
        amountCents: 23_400,
        status: 'pending',
      });
      const events = await auditOf(created.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'create',
        resourceType: 'invoice',
        patientId: patient.id,
        detail: 'emitida',
      });
      expect(JSON.stringify(events[0])).not.toContain('Curativo especializado');
      expect(refreshed).toHaveBeenCalledTimes(1);
    });

    it('Dado valor zero, Quando emite, Então a entrada é recusada e nada é gravado', async () => {
      const patient = await seedPatient();
      signIn('company_admin');
      const { createInvoice } = await billing();

      const result = await createInvoice({
        patientId: patient.id,
        description: 'Sessão avulsa',
        amountCents: 0,
      });

      expect(result.success).toBe(false);
      expect(
        await (await repos()).invoices.findAll({ patientId: patient.id }),
      ).toHaveLength(0);
      expect(refreshed).not.toHaveBeenCalled();
    });

    it('Dado paciente de outra clínica, Quando o Admin emite, Então responde não encontrado e nada é gravado', async () => {
      const other = await getRepositories(clinicScope(CLINIC_B_ID));
      const stranger = buildPatient();
      await other.patients.save(stranger);
      signIn('company_admin');
      const { createInvoice } = await billing();

      const result = await createInvoice({
        patientId: stranger.id,
        description: 'Sessão avulsa',
        amountCents: 15_000,
      });

      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('não encontrad'),
      });
      expect(
        await other.invoices.findAll({ patientId: stranger.id }),
      ).toHaveLength(0);
      expect(refreshed).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: receber, descontar e cancelar', () => {
    it('Dado fatura pendente, Quando o Admin quita, Então a fatura fica paga e a trilha diz quitada', async () => {
      const { invoice } = await seedInvoice();
      const { updateInvoice } = await billing();

      const result = await updateInvoice({
        id: invoice.id,
        change: { action: 'pay', method: 'pix' },
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        status: 'paid',
        paidCents: 15_000,
        balanceCents: 0,
      });
      expect((await auditOf(invoice.id)).map((e) => e.detail)).toContain(
        'quitada',
      );
      expect(refreshed).toHaveBeenCalledTimes(1);
    });

    it('Dado fatura de R$ 100,01 com desconto de 1 centavo, Quando recebe R$ 33,33, Então o saldo é R$ 66,67 e continua pendente', async () => {
      const { invoice } = await seedInvoice(10_001);
      const { updateInvoice } = await billing();

      await updateInvoice({
        id: invoice.id,
        change: {
          action: 'discount',
          amountCents: 1,
          reason: 'arredondamento',
        },
      });
      const result = await updateInvoice({
        id: invoice.id,
        change: { action: 'pay_partial', amountCents: 3333, method: 'pix' },
      });

      expect(result.data).toMatchObject({
        status: 'pending',
        discountCents: 1,
        netAmountCents: 10_000,
        paidCents: 3333,
        balanceCents: 6667,
      });
      expect((await auditOf(invoice.id)).map((e) => e.detail)).toEqual(
        expect.arrayContaining(['desconto', 'pagamento parcial']),
      );
    });

    it('Dado valor acima do saldo, Quando recebe, Então a ação recusa, nada muda e não há trilha', async () => {
      const { invoice } = await seedInvoice(10_000);
      const { updateInvoice } = await billing();
      const before = (await auditOf(invoice.id)).length;

      const result = await updateInvoice({
        id: invoice.id,
        change: { action: 'pay_partial', amountCents: 10_001, method: 'pix' },
      });

      expect(result.success).toBe(false);
      expect(
        (await (await repos()).invoices.findById(invoice.id))?.status,
      ).toBe('pending');
      expect(await auditOf(invoice.id)).toHaveLength(before);
      expect(refreshed).not.toHaveBeenCalled();
    });

    it('Dado pagador com nome e sem CPF, Quando recebe, Então pede os dois e nada é gravado', async () => {
      const { invoice } = await seedInvoice();
      const { updateInvoice } = await billing();

      const result = await updateInvoice({
        id: invoice.id,
        change: { action: 'pay', method: 'pix', payerName: 'João Souza' },
      });

      expect(result).toMatchObject({
        success: false,
        error: 'Informe nome e CPF do pagador, ou deixe os dois em branco',
      });
      expect(
        (await (await repos()).invoices.findById(invoice.id))?.status,
      ).toBe('pending');
    });

    it('Dado pagador com nome e CPF, Quando recebe, Então o recebimento guarda o pagador', async () => {
      const { invoice } = await seedInvoice();
      const { updateInvoice } = await billing();

      const result = await updateInvoice({
        id: invoice.id,
        change: {
          action: 'pay',
          method: 'pix',
          payerName: 'João Souza',
          payerCpf: '529.982.247-25',
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.payments[0]?.payer?.name).toBe('João Souza');
    });

    it('Dado fatura sem recebimento, Quando o Admin cancela, Então fica cancelada e a trilha diz cancelada', async () => {
      const { invoice } = await seedInvoice();
      const { updateInvoice } = await billing();

      const result = await updateInvoice({
        id: invoice.id,
        change: { action: 'cancel' },
      });

      expect(result.data?.status).toBe('cancelled');
      expect((await auditOf(invoice.id)).map((e) => e.detail)).toContain(
        'cancelada',
      );
    });

    it('Dado fatura de outra clínica, Quando o Admin tenta quitar, Então responde não encontrada e nada é gravado nem auditado', async () => {
      const other = await getRepositories(clinicScope(CLINIC_B_ID));
      const stranger = buildPatient();
      await other.patients.save(stranger);
      signIn('company_admin', CLINIC_B_ID);
      const { createInvoice, updateInvoice } = await billing();
      const created = await createInvoice({
        patientId: stranger.id,
        description: 'Outra clínica',
        amountCents: 5000,
      });
      const foreignId = (created.data as NonNullable<typeof created.data>).id;
      signIn('company_admin', CLINIC_A_ID);
      refreshed.mockClear();

      const result = await updateInvoice({
        id: foreignId,
        change: { action: 'pay', method: 'pix' },
      });

      expect(result.success).toBe(false);
      expect((await other.invoices.findById(foreignId))?.status).toBe(
        'pending',
      );
      expect(
        (await other.auditEvents.findAll()).filter(
          (e) => e.resourceId === foreignId && e.detail === 'quitada',
        ),
      ).toHaveLength(0);
      expect(refreshed).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: vender pacote', () => {
    it('Dado procedimento e paciente, Quando o Admin vende, Então pacote e fatura da venda gravam juntos e a trilha registra a venda', async () => {
      const patient = await seedPatient();
      const procedure = buildProcedure();
      const { procedures, sessionPackages, invoices } = await repos();
      await procedures.save(procedure);
      signIn('company_admin');
      const { sellPackage } = await billing();

      const result = await sellPackage({
        patientId: patient.id,
        procedureId: procedure.id,
        totalSessions: 3,
        priceCents: 1000,
        expiresAt: '2030-06-30T23:59:59.000Z',
      });

      expect(result.success).toBe(true);
      const sold = result.data as NonNullable<typeof result.data>;
      const [pkg] = await sessionPackages.findByPatientId(patient.id);
      expect(pkg).toMatchObject({ id: sold.id, totalSessions: 3 });
      const [invoice] = await invoices.findAll({ patientId: patient.id });
      expect(invoice?.amount.cents).toBe(1000);
      const events = await auditOf(sold.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'create',
        resourceType: 'session-package',
        patientId: patient.id,
        detail: 'pacote de 3 sessões vendido',
      });
      expect(refreshed).toHaveBeenCalledTimes(1);
    });

    it('Dado procedimento inexistente, Quando o Admin vende, Então responde não encontrado e nada é gravado', async () => {
      const patient = await seedPatient();
      signIn('company_admin');
      const { sellPackage } = await billing();

      const result = await sellPackage({
        patientId: patient.id,
        procedureId: 'nao-existe',
        totalSessions: 3,
        priceCents: 1000,
      });

      expect(result.success).toBe(false);
      const { sessionPackages, invoices } = await repos();
      expect(await sessionPackages.findByPatientId(patient.id)).toHaveLength(0);
      expect(await invoices.findAll({ patientId: patient.id })).toHaveLength(0);
    });
  });
});

describe('Feature: ações dos Repasses (#547)', () => {
  const PERIOD = '2020-03';

  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const route = await import(`@/app/api${path}/route`);
    const response = await route.POST(jsonRequest(`/api${path}`, 'POST', body));
    return ((await response.json()) as { data: T }).data;
  };
  const patch = async (path: string, id: string, body: unknown) => {
    const route = await import(`@/app/api${path}/[id]/route`);
    await route.PATCH(jsonRequest(`/api${path}/${id}`, 'PATCH', body), {
      params: Promise.resolve({ id }),
    });
  };

  /** Profissional com 40% e uma sessão de R$ 150 realizada e paga no mês encerrado. */
  const seedPaidSession = async (day = '10') => {
    const professional = await post<{ id: string }>('/professionals', {
      fullName: `Dra. Repasse ${day}${Math.random()}`,
      commissionPct: 40,
    });
    const patient = await post<{ id: string }>('/patients', {
      fullName: `Paciente Repasse ${day}`,
      email: `repasse-acao-${Math.random()}@x.com`,
      phone: '11999990000',
    });
    const appointment = await post<{ id: string }>('/appointments', {
      patientId: patient.id,
      professionalId: professional.id,
      procedure: 'Curativo',
      priceCents: 15_000,
      startsAt: `${PERIOD}-${day}T12:00:00.000Z`,
      endsAt: `${PERIOD}-${day}T13:00:00.000Z`,
    });
    await patch('/appointments', appointment.id, { action: 'complete' });
    const invoicesRoute = await import('@/app/api/invoices/route');
    const listed = (await (
      await invoicesRoute.GET(
        jsonRequest(`/api/invoices?patientId=${patient.id}`, 'GET'),
      )
    ).json()) as { data: Array<{ id: string }> };
    await patch('/invoices', listed.data[0].id, {
      action: 'pay',
      method: 'pix',
    });
    return professional.id;
  };

  const close = (professionalId: string, period = PERIOD) =>
    payouts().then(({ closePayout }) =>
      closePayout({
        professionalId,
        period,
        paidAt: '2020-04-05',
        paymentMethod: 'pix',
        notes: 'conferido',
      }),
    );

  it('Dado que não há sessão, Quando fecha o repasse, Então responde Não autenticado e nada é gravado', async () => {
    const professionalId = await seedPaidSession('11');

    const result = await close(professionalId);

    expect(result.error).toBe('Não autenticado');
    expect(
      await (await repos()).commissionPayouts.findAll({ professionalId }),
    ).toHaveLength(0);
  });

  it.each(['atendente', 'profissional'] as const)(
    'Dado o papel %s, Quando tenta fechar e cancelar repasse, Então é recusado e nada é gravado',
    async (role) => {
      const professionalId = await seedPaidSession('12');
      signIn(role);
      const { cancelPayout } = await payouts();

      const closed = await close(professionalId);
      const cancelled = await cancelPayout({
        id: 'qualquer',
        reason: 'engano',
      });

      expect(closed.success).toBe(false);
      expect(cancelled.success).toBe(false);
      expect(
        await (await repos()).commissionPayouts.findAll({ professionalId }),
      ).toHaveLength(0);
      expect(refreshed).not.toHaveBeenCalled();
    },
  );

  it('Dado o Admin, Quando fecha o mês, Então o repasse soma R$ 60,00 (40% de R$ 150), audita e não deixa pagar de novo', async () => {
    const professionalId = await seedPaidSession('13');
    signIn('company_admin');

    const first = await close(professionalId);

    expect(first.success).toBe(true);
    const payout = first.data as NonNullable<typeof first.data>;
    expect(payout).toMatchObject({
      professionalId,
      period: PERIOD,
      totalCents: 6000,
      paidAt: payoutPaidAt('2020-04-05').toISOString(),
      notes: 'conferido',
    });
    expect(payout.createdBy).toBe('company_admin@clinica.com');
    const events = await auditOf(payout.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'create',
      resourceType: 'commission-payout',
      detail: `repasse ${PERIOD}: 1 itens`,
    });
    expect(refreshed).toHaveBeenCalledTimes(1);

    refreshed.mockClear();
    const again = await close(professionalId);
    expect(again.success).toBe(false);
    expect(again.error).toContain('já foi registrado');
    expect(await auditOf(payout.id)).toHaveLength(1);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dado o mês corrente, Quando o Admin tenta fechar, Então só o mês encerrado fecha e nada é gravado', async () => {
    const professionalId = await seedPaidSession('16');
    signIn('company_admin');
    const { zonedMonthKey } = await import('@/domain/shared/time-zone');

    const result = await close(professionalId, zonedMonthKey(new Date()));

    expect(result).toMatchObject({
      success: false,
      error: 'Só é possível fechar um mês depois que ele terminar',
    });
    expect(
      await (await repos()).commissionPayouts.findAll({ professionalId }),
    ).toHaveLength(0);
  });

  it('Dado repasse registrado, Quando o Admin cancela com motivo, Então as sessões voltam ao saldo, a trilha guarda o motivo e o mês fecha de novo', async () => {
    const professionalId = await seedPaidSession('17');
    signIn('company_admin');
    const closed = await close(professionalId);
    const payout = closed.data as NonNullable<typeof closed.data>;
    refreshed.mockClear();
    const { cancelPayout } = await payouts();

    const result = await cancelPayout({
      id: payout.id,
      reason: 'registrado em dobro',
    });

    expect(result.data).toMatchObject({
      id: payout.id,
      status: 'cancelled',
      cancelReason: 'registrado em dobro',
      cancelledBy: 'company_admin@clinica.com',
    });
    const events = await auditOf(payout.id);
    expect(events.map((e) => e.detail)).toContain(
      `repasse ${PERIOD} cancelado: registrado em dobro`,
    );
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect((await close(professionalId)).success).toBe(true);
  });

  it('Dado repasse inexistente, Quando o Admin cancela, Então responde não encontrado e não há trilha', async () => {
    signIn('company_admin');
    const { cancelPayout } = await payouts();

    const result = await cancelPayout({ id: 'nao-existe', reason: 'engano' });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('não encontrad'),
    });
    expect(await auditOf('nao-existe')).toHaveLength(0);
    expect(refreshed).not.toHaveBeenCalled();
  });
});
