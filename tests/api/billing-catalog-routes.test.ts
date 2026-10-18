import { beforeAll, describe, expect, it } from 'vitest';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface InvoiceResponse {
  id: string;
  patientId: string;
  appointmentId: string | null;
  description: string;
  amountCents: number;
  status: string;
}

interface InvoiceSummaryResponse {
  paidCents: number;
  pendingCents: number;
  totalInvoices: number;
  paidCount: number;
  pendingCount: number;
  cancelledCount: number;
}

interface PackageResponse {
  id: string;
  patientId: string;
  procedureId: string;
  procedureName?: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  priceCents: number;
  active: boolean;
}

interface ProcedureResponse {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
  kitItemCount: number;
}

interface KitResponse {
  items: Array<{ supplyId: string; quantity: number }>;
}

interface PatientResponse {
  id: string;
  fullName: string;
}

interface SupplyResponse {
  id: string;
  name: string;
}

describe('Feature: Faturamento e catálogo de procedimentos (API)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let invoicesRoute: typeof import('@/app/api/invoices/route');
  let invoiceByIdRoute: typeof import('@/app/api/invoices/[id]/route');
  let invoicesSummaryRoute: typeof import('@/app/api/invoices/summary/route');
  let packagesRoute: typeof import('@/app/api/packages/route');
  let proceduresRoute: typeof import('@/app/api/procedures/route');
  let procedureByIdRoute: typeof import('@/app/api/procedures/[id]/route');
  let procedureKitRoute: typeof import('@/app/api/procedures/[id]/kit/route');
  let suppliesRoute: typeof import('@/app/api/supplies/route');

  beforeAll(async () => {
    patientsRoute = await import('@/app/api/patients/route');
    invoicesRoute = await import('@/app/api/invoices/route');
    invoiceByIdRoute = await import('@/app/api/invoices/[id]/route');
    invoicesSummaryRoute = await import('@/app/api/invoices/summary/route');
    packagesRoute = await import('@/app/api/packages/route');
    proceduresRoute = await import('@/app/api/procedures/route');
    procedureByIdRoute = await import('@/app/api/procedures/[id]/route');
    procedureKitRoute = await import('@/app/api/procedures/[id]/kit/route');
    suppliesRoute = await import('@/app/api/supplies/route');
  });

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  describe('Rota: /api/invoices', () => {
    let patientAId: string;
    let patientBId: string;

    it('Dado paciente inexistente, Quando POST /api/invoices, Então retorna 404', async () => {
      const response = await invoicesRoute.POST(
        jsonRequest('/api/invoices', 'POST', {
          patientId: 'paciente-fantasma',
          description: 'Consulta avulsa',
          amountCents: 1000,
        }),
      );

      expect(response.status).toBe(404);
    });

    it('Dado dados válidos, Quando POST /api/patients, Então cria pacientes de apoio', async () => {
      const responseA = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Ana Souza',
          email: 'ana.souza@example.com',
          phone: '11911110000',
        }),
      );
      const bodyA = (await responseA.json()) as Envelope<PatientResponse>;
      patientAId = bodyA.data.id;

      const responseB = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Bruno Lima',
          email: 'bruno.lima@example.com',
          phone: '11922220000',
        }),
      );
      const bodyB = (await responseB.json()) as Envelope<PatientResponse>;
      patientBId = bodyB.data.id;

      expect(bodyA.data.fullName).toBe('Ana Souza');
      expect(bodyB.data.fullName).toBe('Bruno Lima');
    });

    it('Dado paciente válido, Quando POST /api/invoices, Então cria fatura pendente', async () => {
      const response = await invoicesRoute.POST(
        jsonRequest('/api/invoices', 'POST', {
          patientId: patientAId,
          description: 'Consulta 1',
          amountCents: 1000,
          dueDate: '2026-08-01T00:00:00.000Z',
        }),
      );
      const body = (await response.json()) as Envelope<InvoiceResponse>;

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('pending');
      expect(body.data.patientId).toBe(patientAId);
      expect(body.data.amountCents).toBe(1000);
      expect(body.data.appointmentId).toBeNull();
    });

    it('Dado paciente válido, Quando POST /api/invoices novamente, Então cria segunda fatura', async () => {
      const response = await invoicesRoute.POST(
        jsonRequest('/api/invoices', 'POST', {
          patientId: patientAId,
          description: 'Consulta 2',
          amountCents: 2000,
        }),
      );
      const body = (await response.json()) as Envelope<InvoiceResponse>;

      expect(response.status).toBe(200);
      expect(body.data.amountCents).toBe(2000);
    });

    it('Dado outro paciente, Quando POST /api/invoices, Então cria fatura vinculada a ele', async () => {
      const response = await invoicesRoute.POST(
        jsonRequest('/api/invoices', 'POST', {
          patientId: patientBId,
          description: 'Consulta 3',
          amountCents: 3000,
        }),
      );
      const body = (await response.json()) as Envelope<InvoiceResponse>;

      expect(response.status).toBe(200);
      expect(body.data.patientId).toBe(patientBId);
    });

    it('Dado filtro por status e paciente, Quando GET /api/invoices, Então retorna apenas faturas pendentes desse paciente', async () => {
      const response = await invoicesRoute.GET(
        jsonRequest(
          `/api/invoices?status=pending&patientId=${patientAId}`,
          'GET',
        ),
      );
      const body = (await response.json()) as Envelope<InvoiceResponse[]>;

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(2);
      const amounts = body.data
        .map((invoice) => invoice.amountCents)
        .sort((a, b) => a - b);
      expect(amounts).toEqual([1000, 2000]);
    });

    it('Dado filtro por paciente, Quando GET /api/invoices, Então retorna apenas as faturas dele', async () => {
      const response = await invoicesRoute.GET(
        jsonRequest(`/api/invoices?patientId=${patientBId}`, 'GET'),
      );
      const body = (await response.json()) as Envelope<InvoiceResponse[]>;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].amountCents).toBe(3000);
    });

    it('Dado limit=1, Quando GET /api/invoices, Então pagina os resultados', async () => {
      const response = await invoicesRoute.GET(
        jsonRequest(`/api/invoices?patientId=${patientAId}&limit=1`, 'GET'),
      );
      const body = (await response.json()) as Envelope<InvoiceResponse[]>;

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(1);
    });

    it('Dado status inválido, Quando GET /api/invoices, Então retorna 400', async () => {
      const response = await invoicesRoute.GET(
        jsonRequest('/api/invoices?status=inexistente', 'GET'),
      );

      expect(response.status).toBe(400);
    });

    it('Dado limit acima do permitido, Quando GET /api/invoices, Então retorna 400', async () => {
      const response = await invoicesRoute.GET(
        jsonRequest('/api/invoices?limit=501', 'GET'),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('Rota: /api/invoices/summary', () => {
    it('Dado mais faturas que uma página, Quando GET /api/invoices/summary, Então soma todas — não só a página', async () => {
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Volume',
          email: 'paciente.volume@example.com',
          phone: '11944440000',
        }),
      );
      const patientBody =
        (await patientResponse.json()) as Envelope<PatientResponse>;
      const volumePatientId = patientBody.data.id;

      const baselineResponse = await invoicesSummaryRoute.GET(
        jsonRequest('/api/invoices/summary', 'GET'),
      );
      const baseline = (
        (await baselineResponse.json()) as Envelope<InvoiceSummaryResponse>
      ).data;

      // PAGE_SIZE da tela de faturamento é 100 — cria mais que isso para
      // provar que o total não fica preso a uma única página.
      const INVOICE_COUNT = 105;
      const PAID_COUNT = 60;
      const AMOUNT_CENTS = 100;
      const createdIds: string[] = [];
      for (let i = 0; i < INVOICE_COUNT; i++) {
        const response = await invoicesRoute.POST(
          jsonRequest('/api/invoices', 'POST', {
            patientId: volumePatientId,
            description: `Fatura volume ${i}`,
            amountCents: AMOUNT_CENTS,
          }),
        );
        const body = (await response.json()) as Envelope<InvoiceResponse>;
        createdIds.push(body.data.id);
      }
      for (let i = 0; i < PAID_COUNT; i++) {
        await invoiceByIdRoute.PATCH(
          jsonRequest(`/api/invoices/${createdIds[i]}`, 'PATCH', {
            action: 'pay',
            method: 'pix',
          }),
          context(createdIds[i]),
        );
      }

      const response = await invoicesSummaryRoute.GET(
        jsonRequest('/api/invoices/summary', 'GET'),
      );
      const body = (await response.json()) as Envelope<InvoiceSummaryResponse>;

      expect(response.status).toBe(200);
      expect(body.data.paidCents).toBe(
        baseline.paidCents + PAID_COUNT * AMOUNT_CENTS,
      );
      expect(body.data.pendingCents).toBe(
        baseline.pendingCents + (INVOICE_COUNT - PAID_COUNT) * AMOUNT_CENTS,
      );
      expect(body.data.totalInvoices).toBe(
        baseline.totalInvoices + INVOICE_COUNT,
      );
    });
  });

  describe('Rota: /api/packages', () => {
    let patientId: string;
    let procedureId: string;

    it('Dado sem patientId, Quando GET /api/packages, Então retorna array vazio', async () => {
      const response = await packagesRoute.GET(
        jsonRequest('/api/packages', 'GET'),
      );
      const body = (await response.json()) as Envelope<PackageResponse[]>;

      expect(response.status).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('Dado dados válidos, Quando POST /api/patients e /api/procedures, Então cria dependências', async () => {
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Carla Mendes',
          email: 'carla.mendes@example.com',
          phone: '11933330000',
        }),
      );
      const patientBody =
        (await patientResponse.json()) as Envelope<PatientResponse>;
      patientId = patientBody.data.id;

      const procedureResponse = await proceduresRoute.POST(
        jsonRequest('/api/procedures', 'POST', {
          name: 'Fisioterapia',
          priceCents: 5000,
          durationMinutes: 30,
        }),
      );
      const procedureBody =
        (await procedureResponse.json()) as Envelope<ProcedureResponse>;
      procedureId = procedureBody.data.id;

      expect(patientBody.data.fullName).toBe('Carla Mendes');
      expect(procedureBody.data.name).toBe('Fisioterapia');
    });

    it('Dado expiresAt no POST /api/packages, Quando criar, Então DTO expõe a validade (COMP3-07/10)', async () => {
      // Paciente e procedimento próprios — não interfere nas contagens dos demais cenários.
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Validade Pacote',
          email: 'validade.pacote@example.com',
          phone: '11922221111',
        }),
      );
      const expiryPatientId = (
        (await patientResponse.json()) as Envelope<PatientResponse>
      ).data.id;
      const procedureResponse = await proceduresRoute.POST(
        jsonRequest('/api/procedures', 'POST', {
          name: 'Sessão com validade',
          priceCents: 5000,
          durationMinutes: 30,
        }),
      );
      const expiryProcedureId = (
        (await procedureResponse.json()) as Envelope<ProcedureResponse>
      ).data.id;

      const response = await packagesRoute.POST(
        jsonRequest('/api/packages', 'POST', {
          patientId: expiryPatientId,
          procedureId: expiryProcedureId,
          totalSessions: 5,
          priceCents: 25000,
          expiresAt: '2030-06-30T00:00:00.000Z',
        }),
      );
      const body = (await response.json()) as Envelope<{
        expiresAt: string | null;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.expiresAt).toBe('2030-06-30T00:00:00.000Z');

      const listResponse = await packagesRoute.GET(
        jsonRequest(`/api/packages?patientId=${expiryPatientId}`, 'GET'),
      );
      const listBody = (await listResponse.json()) as Envelope<
        Array<{ expiresAt: string | null }>
      >;
      expect(
        listBody.data.some((p) => p.expiresAt === '2030-06-30T00:00:00.000Z'),
      ).toBe(true);
    });

    it('Dado paciente inexistente, Quando POST /api/packages, Então retorna 404', async () => {
      const response = await packagesRoute.POST(
        jsonRequest('/api/packages', 'POST', {
          patientId: 'paciente-fantasma',
          procedureId,
          totalSessions: 10,
          priceCents: 100000,
        }),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(404);
      expect(body.error).toContain('Paciente');
    });

    it('Dado procedimento inexistente, Quando POST /api/packages, Então retorna 404', async () => {
      const response = await packagesRoute.POST(
        jsonRequest('/api/packages', 'POST', {
          patientId,
          procedureId: 'procedimento-fantasma',
          totalSessions: 10,
          priceCents: 100000,
        }),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(404);
      expect(body.error).toContain('Procedimento');
    });

    it('Dado dados válidos, Quando POST /api/packages, Então cria pacote e fatura correspondente', async () => {
      const response = await packagesRoute.POST(
        jsonRequest('/api/packages', 'POST', {
          patientId,
          procedureId,
          totalSessions: 10,
          priceCents: 100000,
        }),
      );
      const body = (await response.json()) as Envelope<PackageResponse>;

      expect(response.status).toBe(200);
      expect(body.data.totalSessions).toBe(10);
      expect(body.data.remainingSessions).toBe(body.data.totalSessions);
      expect(body.data.usedSessions).toBe(0);
      expect(body.data.procedureName).toBe('Fisioterapia');

      const invoicesResponse = await invoicesRoute.GET(
        jsonRequest(`/api/invoices?patientId=${patientId}`, 'GET'),
      );
      const invoicesBody = (await invoicesResponse.json()) as Envelope<
        InvoiceResponse[]
      >;

      expect(invoicesBody.data).toHaveLength(1);
      expect(invoicesBody.data[0].amountCents).toBe(100000);
    });

    it('Dado paciente com pacote, Quando GET /api/packages, Então lista com nome do procedimento', async () => {
      const response = await packagesRoute.GET(
        jsonRequest(`/api/packages?patientId=${patientId}`, 'GET'),
      );
      const body = (await response.json()) as Envelope<PackageResponse[]>;

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].procedureName).toBe('Fisioterapia');
      expect(body.data[0].patientId).toBe(patientId);
    });
  });

  describe('Rota: /api/procedures', () => {
    it('Dado dados válidos, Quando POST /api/procedures, Então cria procedimento', async () => {
      const response = await proceduresRoute.POST(
        jsonRequest('/api/procedures', 'POST', {
          name: 'Consulta Padrão',
          priceCents: 15000,
          durationMinutes: 60,
        }),
      );
      const body = (await response.json()) as Envelope<ProcedureResponse>;

      expect(response.status).toBe(200);
      expect(body.data.name).toBe('Consulta Padrão');
      expect(body.data.active).toBe(true);
    });

    it('Dado nome duplicado, Quando POST /api/procedures, Então retorna 400', async () => {
      const response = await proceduresRoute.POST(
        jsonRequest('/api/procedures', 'POST', {
          name: 'Consulta Padrão',
          priceCents: 20000,
          durationMinutes: 45,
        }),
      );

      expect(response.status).toBe(400);
    });

    it('Dado procedimentos cadastrados, Quando GET /api/procedures, Então lista todos', async () => {
      const response = await proceduresRoute.GET(
        jsonRequest('/api/procedures', 'GET'),
      );
      const body = (await response.json()) as Envelope<ProcedureResponse[]>;

      expect(response.status).toBe(200);
      expect(
        body.data.some((procedure) => procedure.name === 'Consulta Padrão'),
      ).toBe(true);
    });
  });

  describe('Rota: /api/procedures/:id', () => {
    let procedureId: string;
    let otherProcedureId: string;

    it('Dado dados válidos, Quando POST /api/procedures, Então cria dois procedimentos de apoio', async () => {
      const responseA = await proceduresRoute.POST(
        jsonRequest('/api/procedures', 'POST', {
          name: 'Avaliação Postural',
          priceCents: 8000,
          durationMinutes: 45,
        }),
      );
      const bodyA = (await responseA.json()) as Envelope<ProcedureResponse>;
      procedureId = bodyA.data.id;

      const responseB = await proceduresRoute.POST(
        jsonRequest('/api/procedures', 'POST', {
          name: 'Massoterapia',
          priceCents: 12000,
          durationMinutes: 50,
        }),
      );
      const bodyB = (await responseB.json()) as Envelope<ProcedureResponse>;
      otherProcedureId = bodyB.data.id;

      expect(bodyA.data.name).toBe('Avaliação Postural');
      expect(bodyB.data.name).toBe('Massoterapia');
    });

    it('Dado novo nome, Quando PATCH /api/procedures/:id, Então atualiza o nome', async () => {
      const response = await procedureByIdRoute.PATCH(
        jsonRequest(`/api/procedures/${procedureId}`, 'PATCH', {
          name: 'Avaliação Postural Completa',
        }),
        context(procedureId),
      );
      const body = (await response.json()) as Envelope<ProcedureResponse>;

      expect(response.status).toBe(200);
      expect(body.data.name).toBe('Avaliação Postural Completa');
    });

    it('Dado active=false, Quando PATCH /api/procedures/:id, Então desativa o procedimento', async () => {
      const response = await procedureByIdRoute.PATCH(
        jsonRequest(`/api/procedures/${procedureId}`, 'PATCH', {
          active: false,
        }),
        context(procedureId),
      );
      const body = (await response.json()) as Envelope<ProcedureResponse>;

      expect(body.data.active).toBe(false);
    });

    it('Dado active=true, Quando PATCH /api/procedures/:id, Então reativa o procedimento', async () => {
      const response = await procedureByIdRoute.PATCH(
        jsonRequest(`/api/procedures/${procedureId}`, 'PATCH', {
          active: true,
        }),
        context(procedureId),
      );
      const body = (await response.json()) as Envelope<ProcedureResponse>;

      expect(body.data.active).toBe(true);
    });

    it('Dado id inexistente, Quando PATCH /api/procedures/:id, Então retorna 404', async () => {
      const response = await procedureByIdRoute.PATCH(
        jsonRequest('/api/procedures/procedimento-fantasma', 'PATCH', {
          active: false,
        }),
        context('procedimento-fantasma'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado nome já usado por outro procedimento, Quando PATCH /api/procedures/:id, Então retorna 400', async () => {
      const response = await procedureByIdRoute.PATCH(
        jsonRequest(`/api/procedures/${otherProcedureId}`, 'PATCH', {
          name: 'Avaliação Postural Completa',
        }),
        context(otherProcedureId),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('Rota: /api/procedures/:id/kit', () => {
    let procedureId: string;
    let supplyId: string;

    it('Dado dados válidos, Quando POST /api/procedures, Então cria procedimento de apoio', async () => {
      const response = await proceduresRoute.POST(
        jsonRequest('/api/procedures', 'POST', {
          name: 'Curativo Especial',
          priceCents: 6000,
          durationMinutes: 30,
        }),
      );
      const body = (await response.json()) as Envelope<ProcedureResponse>;
      procedureId = body.data.id;

      expect(body.data.name).toBe('Curativo Especial');
    });

    it('Dado procedimento sem kit, Quando GET /api/procedures/:id/kit, Então retorna itens vazios', async () => {
      const response = await procedureKitRoute.GET(
        jsonRequest(`/api/procedures/${procedureId}/kit`, 'GET'),
        context(procedureId),
      );
      const body = (await response.json()) as Envelope<KitResponse>;

      expect(response.status).toBe(200);
      expect(body.data.items).toEqual([]);
    });

    it('Dado dados válidos, Quando POST /api/supplies, Então cria insumo de apoio', async () => {
      const response = await suppliesRoute.POST(
        jsonRequest('/api/supplies', 'POST', {
          name: 'Gaze estéril',
          unit: 'un',
          minQty: 10,
          priceCents: 500,
        }),
      );
      const body = (await response.json()) as Envelope<SupplyResponse>;
      supplyId = body.data.id;

      expect(body.data.name).toBe('Gaze estéril');
    });

    it('Dado procedimento inexistente, Quando PUT /api/procedures/:id/kit, Então retorna 404', async () => {
      const response = await procedureKitRoute.PUT(
        jsonRequest('/api/procedures/procedimento-fantasma/kit', 'PUT', {
          items: [{ supplyId, quantity: 5 }],
        }),
        context('procedimento-fantasma'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado itens válidos, Quando PUT /api/procedures/:id/kit, Então salva o kit', async () => {
      const response = await procedureKitRoute.PUT(
        jsonRequest(`/api/procedures/${procedureId}/kit`, 'PUT', {
          items: [{ supplyId, quantity: 5 }],
        }),
        context(procedureId),
      );
      const body = (await response.json()) as Envelope<KitResponse>;

      expect(response.status).toBe(200);
      expect(body.data.items).toEqual([{ supplyId, quantity: 5 }]);
    });

    it('Dado kit salvo, Quando GET /api/procedures/:id/kit, Então confirma os itens', async () => {
      const response = await procedureKitRoute.GET(
        jsonRequest(`/api/procedures/${procedureId}/kit`, 'GET'),
        context(procedureId),
      );
      const body = (await response.json()) as Envelope<KitResponse>;

      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].supplyId).toBe(supplyId);
      expect(body.data.items[0].quantity).toBe(5);
    });

    it('Dado kit salvo, Quando GET /api/procedures, Então o procedimento vem com kitItemCount correto (PROC-03)', async () => {
      const response = await proceduresRoute.GET(
        jsonRequest('/api/procedures', 'GET'),
      );
      const body = (await response.json()) as Envelope<ProcedureResponse[]>;

      const target = body.data.find((p) => p.id === procedureId);
      expect(target?.kitItemCount).toBe(1);
    });
  });
});
