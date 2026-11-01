import { describe, expect, it } from 'vitest';
import {
  type CollectionPath,
  collectionRoute,
  type ItemPath,
  itemRoute,
} from '../support/api-routes';
import { ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

// Mês exclusivo deste arquivo: o livro de repasses e o relatório são da clínica inteira.
const PERIOD = '2032-02';

const call = async <T>(
  handler: Promise<Response> | Response,
  expectedStatus = 200,
): Promise<T> => {
  const response = await handler;
  const parsed = (await response.json()) as Envelope<T>;
  expect(response.status, String(parsed.error)).toBe(expectedStatus);
  return parsed.data;
};

const post = async <T>(path: CollectionPath, body: unknown): Promise<T> => {
  const route = await collectionRoute(path);
  return call<T>(route.POST(jsonRequest(`/api${path}`, 'POST', body)));
};

const patch = async <T>(
  path: ItemPath,
  id: string,
  body: unknown,
): Promise<T> => {
  const route = await itemRoute(path);
  return call<T>(
    route.PATCH(jsonRequest(`/api${path}/${id}`, 'PATCH', body), {
      params: Promise.resolve({ id }),
    }),
  );
};

interface InvoiceRow {
  id: string;
  description: string;
  amountCents: number;
  discountCents: number;
  netAmountCents: number;
  paidCents: number;
  balanceCents: number;
  status: string;
}

const invoicesOf = async (patientId: string): Promise<InvoiceRow[]> => {
  const route = await import('@/app/api/invoices/route');
  return call<InvoiceRow[]>(
    route.GET(jsonRequest(`/api/invoices?patientId=${patientId}`, 'GET')),
  );
};

const summary = async () => {
  const route = await import('@/app/api/invoices/summary/route');
  return call<{
    paidCents: number;
    pendingCents: number;
    pendingCount: number;
  }>(route.GET(jsonRequest('/api/invoices/summary', 'GET')));
};

interface StatementRow {
  professionalId: string;
  payableCents: number;
  pendingCents: number;
  payable: Array<{ baseCents: number; commissionCents: number }>;
  pending: Array<{ baseCents: number; commissionCents: number }>;
}

const payoutsOf = async (professionalId: string) => {
  const route = await import('@/app/api/commission-payouts/route');
  const clinic = await call<{ rows: StatementRow[] }>(
    route.GET(jsonRequest(`/api/commission-payouts?month=${PERIOD}`, 'GET')),
  );
  const own = await import('@/app/api/my-payouts/route');
  const mine = await call<{ scope: string; rows: StatementRow[] }>(
    own.GET(
      jsonRequest(
        `/api/my-payouts?month=${PERIOD}`,
        'GET',
        undefined,
        cookieHeaderFor(
          'profissional',
          'ana@clinica.com',
          undefined,
          professionalId,
        ),
      ),
    ),
  );
  return {
    clinic: clinic.rows.find((r) => r.professionalId === professionalId),
    mine,
  };
};

const completeSession = async (
  patientId: string,
  professionalId: string,
  procedureId: string,
  day: string,
  priceCents: number,
) => {
  const appointment = await post<{ id: string }>('/appointments', {
    patientId,
    professionalId,
    procedureId,
    procedure: 'Curativo paridade',
    priceCents,
    startsAt: `${PERIOD}-${day}T12:00:00.000Z`,
    endsAt: `${PERIOD}-${day}T13:00:00.000Z`,
  });
  await patch('/appointments', appointment.id, { action: 'complete' });
};

/**
 * Paridade do faturamento e dos repasses (#547): valores, totais e comissões
 * ficam IDÊNTICOS antes e depois de levar as telas para o servidor. Escrito
 * contra a API de antes e mantido verde depois; a camada de dados nova é
 * comparada com estes mesmos números em `tests/lib/server/data-billing.test.ts`.
 * O seed cobre arredondamento (centavos que não dividem) e desconto + parcial.
 */
describe('Feature: Paridade de valores do faturamento e dos repasses (banco real)', () => {
  it('Dado o mesmo seed, Quando lista faturas, soma totais e apura repasses, Então centavos, arredondamento e comissões são os de sempre', async () => {
    await ensureTestClinics();
    const baseline = await summary();
    const ana = await post<{ id: string }>('/professionals', {
      fullName: 'Dra. Ana Paridade',
      commissionPct: 33,
    });
    const procedure = await post<{ id: string }>('/procedures', {
      name: 'Curativo paridade',
      priceCents: 10005,
      durationMinutes: 60,
    });
    const maria = await post<{ id: string }>('/patients', {
      fullName: 'Maria Paridade',
      email: 'maria-paridade@x.com',
      phone: '11999990001',
    });
    const joao = await post<{ id: string }>('/patients', {
      fullName: 'João Paridade',
      email: 'joao-paridade@x.com',
      phone: '11999990002',
    });

    // Pacote A: R$ 10,00 em 3 sessões → 333 cada (1000 ÷ 3 = 333,33).
    await post('/packages', {
      patientId: maria.id,
      procedureId: procedure.id,
      totalSessions: 3,
      priceCents: 1000,
    });
    await completeSession(maria.id, ana.id, procedure.id, '02', 10005);
    await completeSession(maria.id, ana.id, procedure.id, '03', 10005);
    await completeSession(maria.id, ana.id, procedure.id, '04', 10005);
    const [packageInvoice] = await invoicesOf(maria.id);
    await patch('/invoices', packageInvoice.id, {
      action: 'pay',
      method: 'pix',
    });

    // Pacote B: R$ 10,01 em 2 sessões → 501 cada (500,5 arredonda para cima).
    await post('/packages', {
      patientId: joao.id,
      procedureId: procedure.id,
      totalSessions: 2,
      priceCents: 1001,
    });
    await completeSession(joao.id, ana.id, procedure.id, '05', 10005);
    await completeSession(joao.id, ana.id, procedure.id, '06', 10005);
    const [packageInvoiceB] = await invoicesOf(joao.id);
    await patch('/invoices', packageInvoiceB.id, {
      action: 'pay',
      method: 'pix',
    });

    // Fatura avulsa R$ 100,01, desconto de 1 centavo e parcial de R$ 33,33.
    const manual = await post<InvoiceRow>('/invoices', {
      patientId: maria.id,
      description: 'Avulsa paridade',
      amountCents: 10001,
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

    // Sem saldo de pacote: sessão avulsa com a fatura da consulta em aberto.
    await completeSession(joao.id, ana.id, procedure.id, '09', 10005);

    const rows = await invoicesOf(maria.id);
    const avulsa = rows.find((r) => r.description === 'Avulsa paridade');
    expect(avulsa).toMatchObject({
      amountCents: 10001,
      discountCents: 1,
      netAmountCents: 10000,
      paidCents: 3333,
      balanceCents: 6667,
      status: 'pending',
    });
    expect(rows.find((r) => r.id === packageInvoice.id)).toMatchObject({
      amountCents: 1000,
      netAmountCents: 1000,
      paidCents: 1000,
      balanceCents: 0,
      status: 'paid',
    });

    const after = await summary();
    expect({
      paidCents: after.paidCents - baseline.paidCents,
      pendingCents: after.pendingCents - baseline.pendingCents,
      pendingCount: after.pendingCount - baseline.pendingCount,
    }).toEqual(EXPECTED_SUMMARY_DELTA);

    const { clinic, mine } = await payoutsOf(ana.id);
    expect(clinic).toBeDefined();
    expect(
      clinic?.payable.map((i) => [i.baseCents, i.commissionCents]),
    ).toEqual(EXPECTED_PAYABLE);
    expect(clinic?.payableCents).toBe(EXPECTED_PAYABLE_TOTAL);
    expect(
      clinic?.pending.map((i) => [i.baseCents, i.commissionCents]),
    ).toEqual(EXPECTED_PENDING);
    expect(clinic?.pendingCents).toBe(EXPECTED_PENDING_TOTAL);
    expect(mine.scope).toBe('own');
    expect(mine.rows[0]).toEqual(clinic);
  });
});

// Recebido: 1000 + 1001 (pacotes) + 3333 (parcial). A receber: saldo 6667 (10001 − 1 − 3333) + a sessão avulsa de 10005.
const EXPECTED_SUMMARY_DELTA = {
  paidCents: 5334,
  pendingCents: 16672,
  pendingCount: 2,
};
// [base, comissão] por sessão liberada: 333 × 33% = 109,89 → 110; 501 × 33% = 165,33 → 165.
const EXPECTED_PAYABLE = [
  [333, 110],
  [333, 110],
  [333, 110],
  [501, 165],
  [501, 165],
];
const EXPECTED_PAYABLE_TOTAL = 660;
// Sessão avulsa com fatura em aberto: a comissão (33% de 100,05 = 33,0165 → 3302) fica a liberar.
const EXPECTED_PENDING = [[10005, 3302]];
const EXPECTED_PENDING_TOTAL = 3302;
