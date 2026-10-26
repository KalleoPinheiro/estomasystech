import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildPatient } from '../support/builders';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
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

const billing = () => import('@/app/(staff)/faturamento/billing-actions');
const payouts = () => import('@/app/(staff)/repasses/payout-actions');
const repos = () => getRepositories(clinicScope(CLINIC_A_ID));

/** Faz a gravação da trilha falhar dentro da transação, como uma falha de banco no meio da ação. */
const breakAudit = async () =>
  (await getDb()).execute(
    sql`ALTER TABLE audit_events ADD CONSTRAINT audit_events_falha_forcada CHECK (false) NOT VALID`,
  );
const repairAudit = async () =>
  (await getDb()).execute(
    sql`ALTER TABLE audit_events DROP CONSTRAINT audit_events_falha_forcada`,
  );

const seedInvoice = async () => {
  const { patients } = await repos();
  const patient = buildPatient();
  await patients.save(patient);
  const { createInvoice } = await billing();
  const created = await createInvoice({
    patientId: patient.id,
    description: 'Sessão avulsa',
    amountCents: 15_000,
  });
  refreshed.mockClear();
  return (created.data as NonNullable<typeof created.data>).id;
};

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

/** Profissional com 40% e uma sessão de R$ 150 realizada e paga num mês já encerrado. */
const seedPaidSession = async () => {
  const professional = await post<{ id: string }>('/professionals', {
    fullName: `Dra. Integração ${Math.random()}`,
    commissionPct: 40,
  });
  const patient = await post<{ id: string }>('/patients', {
    fullName: 'Paciente Integração',
    email: `integracao-${Math.random()}@x.com`,
    phone: '11999990000',
  });
  const appointment = await post<{ id: string }>('/appointments', {
    patientId: patient.id,
    professionalId: professional.id,
    procedure: 'Curativo',
    priceCents: 15_000,
    startsAt: `${PERIOD}-10T12:00:00.000Z`,
    endsAt: `${PERIOD}-10T13:00:00.000Z`,
  });
  await patch('/appointments', appointment.id, { action: 'complete' });
  const invoicesRoute = await import('@/app/api/invoices/route');
  const listed = (await (
    await invoicesRoute.GET(
      jsonRequest(`/api/invoices?patientId=${patient.id}`, 'GET'),
    )
  ).json()) as { data: Array<{ id: string }> };
  await patch('/invoices', listed.data[0].id, { action: 'pay', method: 'pix' });
  return professional.id;
};

const closeInput = (professionalId: string) => ({
  professionalId,
  period: PERIOD,
  paidAt: '2020-04-05',
  paymentMethod: 'pix' as const,
});

beforeEach(async () => {
  await ensureTestClinics();
  refreshed.mockClear();
  cookieStore.value = sessionToken(
    'company_admin',
    'admin@clinica.com',
    undefined,
    CLINIC_A_ID,
  );
});

describe('Feature: ações do Faturamento e dos Repasses gravam e auditam na mesma transação (ADR-075, Postgres real)', () => {
  it('Dado uma fatura pendente, Quando o Admin registra o pagamento, Então a fatura e a trilha ficam gravadas e a tela é atualizada', async () => {
    const invoiceId = await seedInvoice();
    const { updateInvoice } = await billing();

    const result = await updateInvoice({
      id: invoiceId,
      change: { action: 'pay', method: 'pix' },
    });

    expect(result.success).toBe(true);
    const { invoices, auditEvents } = await repos();
    const saved = await invoices.findById(invoiceId);
    expect(saved?.status).toBe('paid');
    expect(saved?.payments).toHaveLength(1);
    expect(
      (await auditEvents.findAll()).filter(
        (e) => e.resourceId === invoiceId && e.detail === 'quitada',
      ),
    ).toHaveLength(1);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado que a gravação da auditoria falha, Quando o Admin registra o pagamento, Então a transação desfaz tudo: a fatura segue pendente, sem recebimento, e a tela não é atualizada', async () => {
    const invoiceId = await seedInvoice();
    await breakAudit();
    const { updateInvoice } = await billing();

    try {
      const result = await updateInvoice({
        id: invoiceId,
        change: { action: 'pay', method: 'pix' },
      });

      expect(result.success).toBe(false);
      const saved = await (await repos()).invoices.findById(invoiceId);
      expect(saved?.status).toBe('pending');
      expect(saved?.payments).toHaveLength(0);
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      await repairAudit();
    }
  });

  it('Dado duas quitações simultâneas da mesma fatura, Quando o Admin clica duas vezes, Então só um recebimento é registrado (nunca em dobro)', async () => {
    const invoiceId = await seedInvoice();
    const { updateInvoice } = await billing();
    const change = { action: 'pay' as const, method: 'pix' as const };

    const results = await Promise.all([
      updateInvoice({ id: invoiceId, change }),
      updateInvoice({ id: invoiceId, change }),
    ]);

    expect(results.filter((r) => r.success)).toHaveLength(1);
    const saved = await (await repos()).invoices.findById(invoiceId);
    expect(saved?.payments).toHaveLength(1);
    expect(saved?.status).toBe('paid');
  });

  it('Dado que a auditoria falha, Quando o Admin fecha o repasse, Então o repasse e as sessões pagas não ficam gravados e o mês continua aberto', async () => {
    const professionalId = await seedPaidSession();
    await breakAudit();
    const { closePayout } = await payouts();

    try {
      const result = await closePayout(closeInput(professionalId));

      expect(result.success).toBe(false);
      const { commissionPayouts } = await repos();
      expect(await commissionPayouts.findAll({ professionalId })).toHaveLength(
        0,
      );
      expect(
        await commissionPayouts.findPaidItems(professionalId),
      ).toHaveLength(0);
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      await repairAudit();
    }

    const retry = await closePayout(closeInput(professionalId));
    expect(retry.success).toBe(true);
    expect(retry.data?.totalCents).toBe(6000);
  });

  it('Dado que a auditoria falha, Quando o Admin cancela um repasse, Então o repasse segue ativo e as sessões seguem pagas', async () => {
    const professionalId = await seedPaidSession();
    const { closePayout, cancelPayout } = await payouts();
    const closed = await closePayout(closeInput(professionalId));
    const payoutId = (closed.data as NonNullable<typeof closed.data>).id;
    refreshed.mockClear();
    await breakAudit();

    try {
      const result = await cancelPayout({
        id: payoutId,
        reason: 'registrado em dobro',
      });

      expect(result.success).toBe(false);
      const { commissionPayouts } = await repos();
      expect((await commissionPayouts.findById(payoutId))?.status).toBe(
        'active',
      );
      expect(
        await commissionPayouts.findPaidItems(professionalId),
      ).toHaveLength(1);
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      await repairAudit();
    }
  });

  it('Dado que a auditoria falha, Quando o Admin vende um pacote, Então nem o pacote nem a fatura da venda ficam gravados', async () => {
    const { patients, procedures, sessionPackages, invoices } = await repos();
    const patient = buildPatient();
    await patients.save(patient);
    const { buildProcedure } = await import('../support/builders');
    const procedure = buildProcedure();
    await procedures.save(procedure);
    await breakAudit();
    const { sellPackage } = await billing();

    try {
      const result = await sellPackage({
        patientId: patient.id,
        procedureId: procedure.id,
        totalSessions: 3,
        priceCents: 3000,
      });

      expect(result.success).toBe(false);
      expect(await sessionPackages.findByPatientId(patient.id)).toHaveLength(0);
      expect(await invoices.findAll({ patientId: patient.id })).toHaveLength(0);
    } finally {
      await repairAudit();
    }
  });
});
