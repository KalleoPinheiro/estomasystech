import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLINIC_B_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface InvoiceDto {
  id: string;
  status: string;
  amountCents: number;
  discountCents: number;
  discountReason: string | null;
  netAmountCents: number;
  paidCents: number;
  balanceCents: number;
  paidAt: string | null;
  paymentMethod: string | null;
  patientName?: string;
  payments: {
    id: string;
    amountCents: number;
    method: string;
    paidAt: string;
  }[];
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });
const clinicB = () =>
  cookieHeaderFor('company_admin', 'admin@b.com', CLINIC_B_ID);

describe('Feature: Pagamento parcial, desconto e recibo (rotas)', () => {
  let invoicesRoute: typeof import('@/app/api/invoices/route');
  let invoiceByIdRoute: typeof import('@/app/api/invoices/[id]/route');
  let summaryRoute: typeof import('@/app/api/invoices/summary/route');
  let auditRoute: typeof import('@/app/api/audit/route');
  let issueRoute: typeof import('@/app/api/documents/issue/route');
  let patientId: string;

  const createInvoice = async (amountCents = 20000) => {
    const response = await invoicesRoute.POST(
      jsonRequest('/api/invoices', 'POST', {
        patientId,
        description: 'Curativo',
        amountCents,
      }),
    );
    return ((await response.json()) as Envelope<InvoiceDto>).data.id;
  };

  const patch = async (
    id: string,
    body: unknown,
    headers?: Record<string, string>,
  ) => {
    const response = await invoiceByIdRoute.PATCH(
      jsonRequest(`/api/invoices/${id}`, 'PATCH', body, headers),
      context(id),
    );
    return {
      status: response.status,
      body: (await response.json()) as Envelope<InvoiceDto>,
    };
  };

  const get = async (id: string, headers?: Record<string, string>) => {
    const response = await invoiceByIdRoute.GET(
      jsonRequest(`/api/invoices/${id}`, 'GET', undefined, headers),
      context(id),
    );
    return {
      status: response.status,
      body: (await response.json()) as Envelope<InvoiceDto>,
    };
  };

  beforeAll(async () => {
    invoicesRoute = await import('@/app/api/invoices/route');
    invoiceByIdRoute = await import('@/app/api/invoices/[id]/route');
    summaryRoute = await import('@/app/api/invoices/summary/route');
    auditRoute = await import('@/app/api/audit/route');
    issueRoute = await import('@/app/api/documents/issue/route');
    const patientsRoute = await import('@/app/api/patients/route');
    await ensureTestClinics();
    const created = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Paula Pagamento',
        email: 'paula.pagamento@example.com',
        phone: '11900004444',
      }),
    );
    patientId = ((await created.json()) as Envelope<{ id: string }>).data.id;
  });

  it('Dado fatura de R$ 200, Quando receber R$ 50 e depois o saldo, Então fica pendente e só quita no fim — e o GET traz os dois recebimentos', async () => {
    const id = await createInvoice();

    const partial = await patch(id, {
      action: 'pay_partial',
      amountCents: 5000,
      method: 'pix',
      paidAt: '2026-07-01T12:00:00.000Z',
    });
    expect(partial.body.data).toMatchObject({
      status: 'pending',
      paidCents: 5000,
      balanceCents: 15000,
    });

    const settled = await patch(id, { action: 'pay', method: 'cash' });
    expect(settled.body.data).toMatchObject({
      status: 'paid',
      paidCents: 20000,
      balanceCents: 0,
      paymentMethod: 'cash',
    });

    const read = await get(id);
    expect(read.body.data.patientName).toBe('Paula Pagamento');
    expect(
      read.body.data.payments.map((p) => [p.amountCents, p.method]),
    ).toEqual([
      [5000, 'pix'],
      [15000, 'cash'],
    ]);
  });

  it('Dado pagamento maior que o saldo, Quando receber, Então 400', async () => {
    const id = await createInvoice(10000);
    const response = await patch(id, {
      action: 'pay_partial',
      amountCents: 10001,
      method: 'pix',
    });
    expect(response.status).toBe(400);
  });

  it('Dado desconto com motivo, Quando aplicar, Então o líquido cai e persiste; sem motivo dá 400', async () => {
    const id = await createInvoice();
    const discounted = await patch(id, {
      action: 'discount',
      amountCents: 3000,
      reason: 'Fidelidade',
    });
    expect(discounted.body.data).toMatchObject({
      discountCents: 3000,
      discountReason: 'Fidelidade',
      netAmountCents: 17000,
      balanceCents: 17000,
    });
    expect((await get(id)).body.data.netAmountCents).toBe(17000);

    const noReason = await patch(id, {
      action: 'discount',
      amountCents: 1000,
      reason: ' ',
    });
    expect(noReason.status).toBe(400);
  });

  it('Dado pagamento parcial, Quando cancelar a fatura, Então 409 e ela segue pendente', async () => {
    const id = await createInvoice();
    await patch(id, {
      action: 'pay_partial',
      amountCents: 1000,
      method: 'pix',
    });
    const response = await patch(id, { action: 'cancel' });
    expect(response.status).toBe(409);
    expect((await get(id)).body.data.status).toBe('pending');
  });

  it('Dado recebimentos parciais, Quando resumir, Então "recebido" soma o parcial e "a receber" é o saldo', async () => {
    const before = await summaryRoute.GET(
      jsonRequest('/api/invoices/summary', 'GET'),
    );
    const base = (
      (await before.json()) as Envelope<{
        paidCents: number;
        pendingCents: number;
      }>
    ).data;

    const id = await createInvoice(10000);
    await patch(id, {
      action: 'discount',
      amountCents: 2000,
      reason: 'Acordo',
    });
    await patch(id, {
      action: 'pay_partial',
      amountCents: 3000,
      method: 'pix',
    });

    const after = await summaryRoute.GET(
      jsonRequest('/api/invoices/summary', 'GET'),
    );
    const summary = (
      (await after.json()) as Envelope<{
        paidCents: number;
        pendingCents: number;
      }>
    ).data;
    expect(summary.paidCents - base.paidCents).toBe(3000);
    expect(summary.pendingCents - base.pendingCents).toBe(5000);
  });

  it('Dado ações na fatura, Então cada uma fica na auditoria', async () => {
    const id = await createInvoice();
    await patch(id, { action: 'discount', amountCents: 1000, reason: 'Teste' });
    await patch(id, {
      action: 'pay_partial',
      amountCents: 1000,
      method: 'pix',
    });

    const findDetails = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const response = await auditRoute.GET(
          jsonRequest(`/api/audit?patientId=${patientId}`, 'GET'),
        );
        const events = (
          (await response.json()) as Envelope<
            { resourceId: string; detail: string | null }[]
          >
        ).data.filter((e) => e.resourceId === id);
        if (events.length >= 2) return events.map((e) => e.detail).sort();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return [];
    };
    expect(await findDetails()).toEqual(['desconto', 'pagamento parcial']);
  });

  it('Dado fatura da clínica A, Quando a clínica B lê ou recebe, Então 404', async () => {
    const id = await createInvoice();
    expect((await get(id, clinicB())).status).toBe(404);
    expect(
      (
        await patch(
          id,
          { action: 'pay_partial', amountCents: 100, method: 'pix' },
          clinicB(),
        )
      ).status,
    ).toBe(404);
  });

  it('Dado atendente, Quando ler fatura, Então 403 (faturamento é do Admin)', async () => {
    const id = await createInvoice();
    const response = await get(id, cookieHeaderFor('atendente', 'r@c.com'));
    expect(response.status).toBe(403);
  });

  it('Dado recibo de um pagamento, Quando emitir duas vezes, Então o número REC- é o mesmo', async () => {
    // Recibo só emite com CPF do paciente e CNPJ da empresa (#326).
    const { completeClinicRegistration, CLINIC_A_ID } = await import(
      '../support/clinics'
    );
    await completeClinicRegistration(CLINIC_A_ID);
    const patientRoute = await import('@/app/api/patients/[id]/route');
    await patientRoute.PUT(
      jsonRequest(`/api/patients/${patientId}`, 'PUT', {
        cpf: '529.982.247-25',
      }),
      { params: Promise.resolve({ id: patientId }) },
    );
    const id = await createInvoice();
    const paid = await patch(id, { action: 'pay', method: 'pix' });
    const paymentId = paid.body.data.payments[0].id;

    const issue = async () => {
      const response = await issueRoute.POST(
        jsonRequest('/api/documents/issue', 'POST', {
          documentType: 'recibo',
          resourceId: paymentId,
          invoiceId: id,
        }),
      );
      return ((await response.json()) as Envelope<{ documentNumber: string }>)
        .data.documentNumber;
    };
    const first = await issue();
    expect(first).toMatch(/^REC-/);
    expect(await issue()).toBe(first);
  });

  it('Dado fatura paga antes dos recebimentos existirem, Quando a migração roda, Então ganha um recebimento legado com valor, forma e data', async () => {
    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    const db = await getDb();
    const id = await createInvoice(12345);
    // Estado anterior à migração: paga, sem nenhum recebimento gravado.
    await db.execute(
      sql`update invoices set status = 'paid', payment_method = 'debit_card', paid_at = '2026-01-10T12:00:00Z' where id = ${id}`,
    );

    const migration = readdirSync(path.join(process.cwd(), 'drizzle')).find(
      (file) => file.startsWith('0036_'),
    ) as string;
    const backfill = readFileSync(
      path.join(process.cwd(), 'drizzle', migration),
      'utf8',
    )
      .split('--> statement-breakpoint')
      .find((statement) => statement.includes('INSERT INTO "invoice_payments"'))
      ?.replace(
        /WHERE "status" = 'paid'/,
        `WHERE "status" = 'paid' AND "id" = '${id}'`,
      ) as string;
    await db.execute(sql.raw(backfill));

    const read = await get(id);
    expect(read.body.data.payments).toEqual([
      {
        id: `legacy-${id}`,
        amountCents: 12345,
        method: 'debit_card',
        paidAt: '2026-01-10T12:00:00.000Z',
        payer: null,
      },
    ]);
    expect(read.body.data.paidCents).toBe(12345);
  });
});
