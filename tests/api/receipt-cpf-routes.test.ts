import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  completeClinicRegistration,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface PatientBody {
  id: string;
  cpfMasked: string | null;
}

interface InvoiceBody {
  id: string;
  payments: {
    id: string;
    payer: { name: string; cpfMasked: string } | null;
  }[];
}

interface ReceiptBody {
  payer: { name: string; document: string };
  provider: { name: string; document: string };
  payerIsPatient: boolean;
}

const VALID_CPF = '529.982.247-25';
const PAYER_CPF = '111.444.777-35';
const clinicB = () =>
  cookieHeaderFor('company_admin', 'admin@b.com', CLINIC_B_ID);

describe('Feature: CPF no recibo para o IRPF (#326, FIN-RN-15)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientByIdRoute: typeof import('@/app/api/patients/[id]/route');
  let invoicesRoute: typeof import('@/app/api/invoices/route');
  let invoiceByIdRoute: typeof import('@/app/api/invoices/[id]/route');
  let receiptRoute: typeof import('@/app/api/invoices/[id]/payments/[paymentId]/receipt/route');
  let issueRoute: typeof import('@/app/api/documents/issue/route');
  let exportRoute: typeof import('@/app/api/patients/[id]/export/route');
  let seq = 0;

  beforeAll(async () => {
    patientsRoute = await import('@/app/api/patients/route');
    patientByIdRoute = await import('@/app/api/patients/[id]/route');
    invoicesRoute = await import('@/app/api/invoices/route');
    invoiceByIdRoute = await import('@/app/api/invoices/[id]/route');
    receiptRoute = await import(
      '@/app/api/invoices/[id]/payments/[paymentId]/receipt/route'
    );
    issueRoute = await import('@/app/api/documents/issue/route');
    exportRoute = await import('@/app/api/patients/[id]/export/route');
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
  });

  const createPatient = async (
    cpf?: string | null,
    headers?: Record<string, string>,
  ) => {
    seq += 1;
    const response = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        {
          fullName: `Paciente Recibo ${seq}`,
          email: `recibo${seq}-${Date.now()}@example.com`,
          phone: '11900004444',
          ...(cpf === undefined ? {} : { cpf }),
        },
        headers,
      ),
    );
    return {
      status: response.status,
      body: (await response.json()) as Envelope<PatientBody>,
    };
  };

  const paidInvoice = async (
    patientId: string,
    extra: Record<string, unknown> = {},
    headers?: Record<string, string>,
  ) => {
    const created = await invoicesRoute.POST(
      jsonRequest(
        '/api/invoices',
        'POST',
        { patientId, description: 'Curativo', amountCents: 20000 },
        headers,
      ),
    );
    const { id } = ((await created.json()) as Envelope<InvoiceBody>).data;
    const paid = await invoiceByIdRoute.PATCH(
      jsonRequest(
        `/api/invoices/${id}`,
        'PATCH',
        { action: 'pay', method: 'pix', ...extra },
        headers,
      ),
      { params: Promise.resolve({ id }) },
    );
    return {
      status: paid.status,
      body: (await paid.json()) as Envelope<InvoiceBody>,
    };
  };

  const receipt = async (
    invoiceId: string,
    paymentId: string,
    headers?: Record<string, string>,
  ) => {
    const response = await receiptRoute.GET(
      jsonRequest(
        `/api/invoices/${invoiceId}/payments/${paymentId}/receipt`,
        'GET',
        undefined,
        headers,
      ),
      { params: Promise.resolve({ id: invoiceId, paymentId }) },
    );
    return {
      status: response.status,
      body: (await response.json()) as Envelope<ReceiptBody>,
    };
  };

  const issue = async (
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ) => {
    const response = await issueRoute.POST(
      jsonRequest('/api/documents/issue', 'POST', body, headers),
    );
    return {
      status: response.status,
      body: (await response.json()) as Envelope<{ documentNumber: string }>,
    };
  };

  describe('Cenário: cadastro do CPF do paciente', () => {
    it('Dado CPF válido com máscara, Quando cadastrar, Então a resposta traz só o CPF mascarado', async () => {
      const { status, body } = await createPatient(VALID_CPF);

      expect(status).toBe(200);
      expect(body.data.cpfMasked).toBe('***.***.247-**');
      expect(JSON.stringify(body)).not.toContain('52998224725');
      expect(JSON.stringify(body)).not.toContain(VALID_CPF);
    });

    it('Dado cadastro sem CPF (idoso, estrangeiro), Quando cadastrar, Então é aceito', async () => {
      const { status, body } = await createPatient();

      expect(status).toBe(200);
      expect(body.data.cpfMasked).toBeNull();
    });

    it('Dado CPF com dígito verificador errado, Quando cadastrar, Então 400 com a mensagem', async () => {
      const { status, body } = await createPatient('529.982.247-24');

      expect(status).toBe(400);
      expect(body.error).toMatch(/CPF inválido/);
    });

    it('Dado paciente com CPF, Quando editar outro campo, Então o CPF é mantido; vazio remove', async () => {
      const { body: created } = await createPatient(VALID_CPF);
      const id = created.data.id;
      const put = async (data: Record<string, unknown>) => {
        const response = await patientByIdRoute.PUT(
          jsonRequest(`/api/patients/${id}`, 'PUT', data),
          { params: Promise.resolve({ id }) },
        );
        return ((await response.json()) as Envelope<PatientBody>).data;
      };

      expect((await put({ fullName: 'Nome Novo Silva' })).cpfMasked).toBe(
        '***.***.247-**',
      );
      expect((await put({ cpf: PAYER_CPF })).cpfMasked).toBe('***.***.777-**');
      expect((await put({ cpf: '' })).cpfMasked).toBeNull();
    });

    it('Dado CPF gravado, Quando ler a coluna crua, Então está cifrado (v1) e nunca em claro', async () => {
      const { body } = await createPatient(VALID_CPF);
      const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
      const db = await getDb();
      const result = await db.execute(
        sql`select cpf from patients where id = ${body.data.id}`,
      );
      const stored = (result as unknown as { rows: { cpf: string }[] }).rows[0]
        .cpf;

      expect(stored).toMatch(/^v1\./);
      expect(stored).not.toContain('52998224725');
    });

    it('Dado paciente com CPF, Quando exportar os dados do titular (LGPD), Então o CPF vai inteiro', async () => {
      const { body } = await createPatient(VALID_CPF);
      const response = await exportRoute.GET(
        jsonRequest(`/api/patients/${body.data.id}/export`, 'GET'),
        { params: Promise.resolve({ id: body.data.id }) },
      );
      const json = (await response.json()) as Envelope<{
        patient: { cpf: string };
      }>;

      expect(json.data.patient.cpf).toBe('52998224725');
    });
  });

  describe('Cenário: recibo', () => {
    it('Dado paciente com CPF e empresa com CNPJ, Quando abrir o recibo, Então traz CPF do pagador e CNPJ do prestador', async () => {
      const { body: patient } = await createPatient(VALID_CPF);
      const { body: invoice } = await paidInvoice(patient.data.id);

      const result = await receipt(
        invoice.data.id,
        invoice.data.payments[0].id,
      );

      expect(result.status).toBe(200);
      expect(result.body.data).toMatchObject({
        payer: { document: VALID_CPF },
        provider: { document: '11.111.111/0001-11' },
        payerIsPatient: true,
      });
    });

    it('Dado paciente sem CPF, Quando abrir o recibo, Então 400 com orientação — e a emissão persistida também é barrada', async () => {
      const { body: patient } = await createPatient();
      const { body: invoice } = await paidInvoice(patient.data.id);
      const paymentId = invoice.data.payments[0].id;

      const blocked = await receipt(invoice.data.id, paymentId);
      expect(blocked.status).toBe(400);
      expect(blocked.body.error).toMatch(/não tem CPF cadastrado/);
      expect(blocked.body.error).toMatch(/ficha do paciente/);

      const direct = await issue({
        documentType: 'recibo',
        resourceId: paymentId,
        invoiceId: invoice.data.id,
      });
      expect(direct.status).toBe(400);
      expect(direct.body.error).toMatch(/não tem CPF cadastrado/);
    });

    it('Dado pagador distinto sem CPF do paciente, Quando abrir o recibo, Então sai no nome do pagador e a emissão passa', async () => {
      const { body: patient } = await createPatient();
      const { body: invoice } = await paidInvoice(patient.data.id, {
        payerName: 'João Pagador',
        payerCpf: PAYER_CPF,
      });
      const payment = invoice.data.payments[0];
      expect(payment.payer).toEqual({
        name: 'João Pagador',
        cpfMasked: '***.***.777-**',
      });

      const result = await receipt(invoice.data.id, payment.id);
      expect(result.body.data.payer).toEqual({
        name: 'João Pagador',
        document: PAYER_CPF,
      });
      expect(result.body.data.payerIsPatient).toBe(false);

      const emitted = await issue({
        documentType: 'recibo',
        resourceId: payment.id,
        invoiceId: invoice.data.id,
      });
      expect(emitted.status).toBe(200);
      expect(emitted.body.data.documentNumber).toMatch(/^REC-/);
    });

    it('Dado o CPF do pagador gravado, Quando ler a coluna crua, Então está cifrado', async () => {
      const { body: patient } = await createPatient();
      const { body: invoice } = await paidInvoice(patient.data.id, {
        payerName: 'João Pagador',
        payerCpf: PAYER_CPF,
      });
      const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
      const db = await getDb();
      const result = await db.execute(
        sql`select payer_cpf from invoice_payments where id = ${invoice.data.payments[0].id}`,
      );
      const stored = (result as unknown as { rows: { payer_cpf: string }[] })
        .rows[0].payer_cpf;

      expect(stored).toMatch(/^v1\./);
      expect(stored).not.toContain('11144477735');
    });

    it('Dado nome sem CPF do pagador (ou o contrário), Quando receber, Então 400 e nada é pago', async () => {
      const { body: patient } = await createPatient(VALID_CPF);
      const onlyName = await paidInvoice(patient.data.id, {
        payerName: 'João Pagador',
      });
      const badCpf = await paidInvoice(patient.data.id, {
        payerName: 'João Pagador',
        payerCpf: '123.456.789-00',
      });

      expect(onlyName.status).toBe(400);
      expect(onlyName.body.error).toMatch(/nome e CPF do pagador/);
      expect(badCpf.status).toBe(400);
      expect(badCpf.body.error).toMatch(/CPF inválido/);
    });

    it('Dado recibo sem fatura informada na emissão, Então 400', async () => {
      const direct = await issue({
        documentType: 'recibo',
        resourceId: 'qualquer',
      });
      expect(direct.status).toBe(400);
      expect(direct.body.error).toMatch(/fatura do recibo/);
    });

    it('Dado pagamento inexistente, Quando abrir o recibo, Então 404', async () => {
      const { body: patient } = await createPatient(VALID_CPF);
      const { body: invoice } = await paidInvoice(patient.data.id);

      expect((await receipt(invoice.data.id, 'nao-existe')).status).toBe(404);
    });

    it('Dado empresa sem CNPJ, Quando abrir o recibo, Então 400 pedindo o cadastro da empresa', async () => {
      const { body: patient } = await createPatient(VALID_CPF, clinicB());
      const { body: invoice } = await paidInvoice(
        patient.data.id,
        {},
        clinicB(),
      );

      const result = await receipt(
        invoice.data.id,
        invoice.data.payments[0].id,
        clinicB(),
      );

      expect(result.status).toBe(400);
      expect(result.body.error).toMatch(/não tem CNPJ cadastrado/);
    });

    it('Dado recibo de outra empresa, Quando abrir, Então 404 (isolamento por empresa)', async () => {
      const { body: patient } = await createPatient(VALID_CPF);
      const { body: invoice } = await paidInvoice(patient.data.id);

      const result = await receipt(
        invoice.data.id,
        invoice.data.payments[0].id,
        clinicB(),
      );

      expect(result.status).toBe(404);
    });

    it('Dado recibo aberto, Então a leitura do CPF é auditada sem o número', async () => {
      const { body: patient } = await createPatient(VALID_CPF);
      const { body: invoice } = await paidInvoice(patient.data.id);
      await receipt(invoice.data.id, invoice.data.payments[0].id);

      const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
      const db = await getDb();
      const result = await db.execute(
        sql`select detail, resource_type from audit_events where resource_id = ${invoice.data.payments[0].id}`,
      );
      const { rows } = result as unknown as {
        rows: { detail: string; resource_type: string }[];
      };

      expect(rows.some((r) => r.resource_type === 'recibo')).toBe(true);
      expect(JSON.stringify(rows)).not.toMatch(/52998224725|529\.982/);
    });
  });
});
