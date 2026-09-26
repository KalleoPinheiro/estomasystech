import { beforeAll, describe, expect, it } from 'vitest';
import { jsonRequest } from '../support/request';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface InvoiceDto {
  id: string;
  status: string;
  paidCents: number;
  payments: { id: string; amountCents: number }[];
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

/**
 * Issue #192: dois `pay_partial` simultâneos (duplo clique, duas recepcionistas,
 * retry de rede) liam a mesma fatura, e os dois pagamentos eram gravados —
 * recebido em dobro, dois recibos, comissão sobre valor irreal.
 */
describe('Feature: pagamento de fatura serializado (#192)', () => {
  let invoicesRoute: typeof import('@/app/api/invoices/route');
  let invoiceByIdRoute: typeof import('@/app/api/invoices/[id]/route');
  let patientId: string;

  beforeAll(async () => {
    invoicesRoute = await import('@/app/api/invoices/route');
    invoiceByIdRoute = await import('@/app/api/invoices/[id]/route');
    const patientsRoute = await import('@/app/api/patients/route');
    const patient = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Paciente Pagamento Concorrente',
        email: 'pagamento-concorrente@x.com',
        phone: '11999990000',
      }),
    );
    patientId = ((await patient.json()) as Envelope<{ id: string }>).data.id;
  });

  it('C21 pagamentos concorrentes não duplicam o recebimento', async () => {
    const created = await invoicesRoute.POST(
      jsonRequest('/api/invoices', 'POST', {
        patientId,
        description: 'Curativo',
        amountCents: 10000,
      }),
    );
    const id = ((await created.json()) as Envelope<InvoiceDto>).data.id;
    const pay = () =>
      invoiceByIdRoute.PATCH(
        jsonRequest(`/api/invoices/${id}`, 'PATCH', {
          action: 'pay_partial',
          amountCents: 10000,
          method: 'pix',
        }),
        context(id),
      );

    const [a, b] = await Promise.all([pay(), pay()]);
    const statuses = [a.status, b.status].sort();

    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    expect(statuses[1]).toBeLessThan(500);

    const read = await invoiceByIdRoute.GET(
      jsonRequest(`/api/invoices/${id}`, 'GET'),
      context(id),
    );
    const invoice = ((await read.json()) as Envelope<InvoiceDto>).data;
    expect(invoice.status).toBe('paid');
    expect(invoice.payments).toHaveLength(1);
    expect(invoice.paidCents).toBe(10000);
  });
});
