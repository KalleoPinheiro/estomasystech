import { describe, expect, it } from 'vitest';
import type { Session } from '@/lib/auth/session';
import {
  getInvoiceSummaryFor,
  INVOICE_PAGE_SIZE,
  listInvoicesFor,
} from '@/lib/server/data/invoices';
import {
  getClinicPayoutsFor,
  getOwnPayoutsFor,
} from '@/lib/server/data/payouts';
import { listProceduresFor } from '@/lib/server/data/procedures';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../../support/clinics';
import { jsonRequest } from '../../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

// Mês exclusivo deste arquivo: o livro de repasses é da clínica inteira.
const PERIOD = '2033-02';

const session = (overrides: Partial<Session> = {}): Session =>
  ({
    role: 'company_admin',
    subject: 'admin@clinica.com',
    clinicId: CLINIC_A_ID,
    professionalId: null,
    ...overrides,
  }) as unknown as Session;

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

const completeSession = async (
  patientId: string,
  professionalId: string,
  procedureId: string,
  day: string,
) => {
  const appointment = await post<{ id: string }>('/appointments', {
    patientId,
    professionalId,
    procedureId,
    procedure: 'Curativo dados',
    priceCents: 10_005,
    startsAt: `${PERIOD}-${day}T12:00:00.000Z`,
    endsAt: `${PERIOD}-${day}T13:00:00.000Z`,
  });
  await patch('/appointments', appointment.id, { action: 'complete' });
};

const itemsOf = (
  items: Array<{ baseCents: number; commissionCents: number }>,
) => items.map((i) => [i.baseCents, i.commissionCents]);

/**
 * Paridade com `tests/api/faturamento-paridade.test.ts` (escrito antes da
 * migração): a camada de dados nova devolve EXATAMENTE os mesmos valores,
 * totais e comissões da API de antes, para o mesmo seed.
 */
describe('Feature: leituras do Faturamento e dos Repasses no servidor (#547)', () => {
  it('Dado o mesmo seed da API, Quando lê faturas, totais e repasses pela camada de dados, Então centavos, arredondamento e comissões são os de sempre', async () => {
    await ensureTestClinics();
    const baseline = await getInvoiceSummaryFor(session());
    const ana = await post<{ id: string }>('/professionals', {
      fullName: 'Dra. Ana Dados',
      commissionPct: 33,
    });
    const procedure = await post<{ id: string }>('/procedures', {
      name: 'Curativo dados',
      priceCents: 10_005,
      durationMinutes: 60,
    });
    const maria = await post<{ id: string }>('/patients', {
      fullName: 'Maria Dados',
      email: 'maria-dados@x.com',
      phone: '11999990001',
    });
    const joao = await post<{ id: string }>('/patients', {
      fullName: 'João Dados',
      email: 'joao-dados@x.com',
      phone: '11999990002',
    });

    await post('/packages', {
      patientId: maria.id,
      procedureId: procedure.id,
      totalSessions: 3,
      priceCents: 1000,
    });
    for (const day of ['01', '02', '03']) {
      await completeSession(maria.id, ana.id, procedure.id, day);
    }
    const [packageA] = (
      await listInvoicesFor(session(), { patientId: maria.id })
    ).invoices;
    await patch('/invoices', packageA.id, { action: 'pay', method: 'pix' });

    await post('/packages', {
      patientId: joao.id,
      procedureId: procedure.id,
      totalSessions: 2,
      priceCents: 1001,
    });
    for (const day of ['04', '07']) {
      await completeSession(joao.id, ana.id, procedure.id, day);
    }
    const [packageB] = (
      await listInvoicesFor(session(), { patientId: joao.id })
    ).invoices;
    await patch('/invoices', packageB.id, { action: 'pay', method: 'pix' });

    const manual = await post<{ id: string }>('/invoices', {
      patientId: maria.id,
      description: 'Avulsa dados',
      amountCents: 10_001,
    });
    await patch('/invoices', manual.id, {
      action: 'discount',
      amountCents: 1,
      reason: 'arredondamento',
    });
    await patch('/invoices', manual.id, {
      action: 'pay_partial',
      amountCents: 3333,
      method: 'pix',
    });
    await completeSession(joao.id, ana.id, procedure.id, '08');

    const { invoices } = await listInvoicesFor(session(), {
      patientId: maria.id,
    });
    expect(invoices.find((i) => i.id === manual.id)).toMatchObject({
      amountCents: 10_001,
      discountCents: 1,
      netAmountCents: 10_000,
      paidCents: 3333,
      balanceCents: 6667,
      status: 'pending',
    });
    const after = await getInvoiceSummaryFor(session());
    expect({
      paidCents: after.paidCents - baseline.paidCents,
      pendingCents: after.pendingCents - baseline.pendingCents,
      pendingCount: after.pendingCount - baseline.pendingCount,
    }).toEqual({ paidCents: 5334, pendingCents: 16_672, pendingCount: 2 });

    const clinic = await getClinicPayoutsFor(session(), PERIOD);
    const row = clinic.rows.find((r) => r.professionalId === ana.id);
    expect(clinic.scope).toBe('clinic');
    expect(itemsOf(row?.payable ?? [])).toEqual([
      [333, 110],
      [333, 110],
      [333, 110],
      [501, 165],
      [501, 165],
    ]);
    expect(row?.payableCents).toBe(660);
    expect(itemsOf(row?.pending ?? [])).toEqual([[10_005, 3302]]);
    expect(row?.pendingCents).toBe(3302);

    const own = await getOwnPayoutsFor(
      session({ role: 'profissional', professionalId: ana.id }),
      PERIOD,
    );
    expect(own.scope).toBe('own');
    expect(own.rows).toEqual([row]);
  });

  it('Dado várias faturas, Quando lê página a página com cursor e filtro de situação, Então percorre todas sem repetir e a última página fecha o cursor', async () => {
    await ensureTestClinics();
    const patient = await post<{ id: string }>('/patients', {
      fullName: 'Paciente Paginação',
      email: 'paginacao-dados@x.com',
      phone: '11999990003',
    });
    const created: string[] = [];
    for (const amountCents of [1000, 2000, 3000]) {
      const invoice = await post<{ id: string }>('/invoices', {
        patientId: patient.id,
        description: `Fatura ${amountCents}`,
        amountCents,
      });
      created.push(invoice.id);
    }
    await patch('/invoices', created[0], { action: 'cancel' });

    const first = await listInvoicesFor(session(), {
      patientId: patient.id,
      limit: 2,
    });
    expect(first.invoices).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await listInvoicesFor(session(), {
      patientId: patient.id,
      limit: 2,
      cursor: first.nextCursor as string,
    });
    expect(second.invoices).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      [...first.invoices, ...second.invoices].map((i) => i.id).sort(),
    ).toEqual([...created].sort());

    const pending = await listInvoicesFor(session(), {
      patientId: patient.id,
      status: 'pending',
    });
    expect(pending.invoices).toHaveLength(2);
    expect(INVOICE_PAGE_SIZE).toBe(100);
    expect(pending.nextCursor).toBeNull();
    const ranged = await listInvoicesFor(session(), {
      patientId: patient.id,
      from: new Date('2000-01-01T00:00:00Z'),
      to: new Date('2000-01-02T00:00:00Z'),
    });
    expect(ranged.invoices).toEqual([]);
  });

  it('Dado conta sem profissional vinculado, Quando lê o extrato próprio, Então vem vazio', async () => {
    await ensureTestClinics();

    const own = await getOwnPayoutsFor(session(), PERIOD);

    expect(own).toEqual({
      scope: 'own',
      period: PERIOD,
      rows: [],
      history: [],
    });
  });

  it('Dado Admin de outra clínica, Quando lê faturas e repasses, Então não vê os da clínica A', async () => {
    await ensureTestClinics();
    const other = session({ clinicId: CLINIC_B_ID });

    const invoices = await listInvoicesFor(other, { limit: 500 });
    const clinic = await getClinicPayoutsFor(other, PERIOD);

    expect(invoices.invoices.map((i) => i.description)).not.toContain(
      'Avulsa dados',
    );
    expect(clinic.rows.map((r) => r.professionalName)).not.toContain(
      'Dra. Ana Dados',
    );
  });

  it('Dado procedimento cadastrado, Quando lê o catálogo, Então vem com a contagem de itens do kit', async () => {
    await ensureTestClinics();
    const created = await post<{ id: string; name: string }>('/procedures', {
      name: 'Procedimento catálogo dados',
      priceCents: 7000,
      durationMinutes: 30,
    });

    const catalog = await listProceduresFor(session());

    expect(catalog.find((p) => p.id === created.id)).toMatchObject({
      name: 'Procedimento catálogo dados',
      priceCents: 7000,
      kitItemCount: 0,
    });
  });
});
