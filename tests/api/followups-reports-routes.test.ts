import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface FollowUpDto {
  id: string;
  patientId: string;
  patientName?: string;
  appointmentId: string | null;
  dueDate: string;
  reason: string;
  status: string;
  isOverdue?: boolean;
}

interface PatientDto {
  id: string;
  fullName: string;
}

interface AppointmentDto {
  id: string;
  status: string;
}

interface InvoiceDto {
  id: string;
  status: string;
}

interface SupplyDto {
  id: string;
}

interface ProfessionalDto {
  id: string;
}

interface MonthlyReportDto {
  totalAppointments: number;
  byStatus: Record<string, number>;
  noShowRate: number;
  revenueByProcedure: Array<{
    procedure: string;
    count: number;
    totalCents: number;
    supplyCostCents: number;
    supplyCostKnown: boolean;
    marginCents: number;
  }>;
  unattributedSupplyCostCents: number;
  totalSupplyCostCents: number;
  productionByProfessional: Array<{
    professionalId: string | null;
    professionalName: string;
    count: number;
    totalCents: number;
    commissionCents: number | null;
  }>;
  billing: { paidCents: number; paidCount: number };
}

interface SummaryDto {
  billing: { paidCents: number; paidCount: number };
  appointmentsInMonth: number;
  today: unknown[];
}

describe('Feature: Retornos (follow-ups), relatórios e resumo', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  let appointmentByIdRoute: typeof import('@/app/api/appointments/[id]/route');
  let invoiceByIdRoute: typeof import('@/app/api/invoices/[id]/route');
  let professionalsRoute: typeof import('@/app/api/professionals/route');
  let suppliesRoute: typeof import('@/app/api/supplies/route');
  let supplyMovementsRoute: typeof import('@/app/api/supplies/[id]/movements/route');
  let followUpsRoute: typeof import('@/app/api/follow-ups/route');
  let followUpByIdRoute: typeof import('@/app/api/follow-ups/[id]/route');
  let reportsRoute: typeof import('@/app/api/reports/route');
  let summaryRoute: typeof import('@/app/api/summary/route');

  let patientId: string;

  beforeAll(async () => {
    patientsRoute = await import('@/app/api/patients/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    appointmentByIdRoute = await import('@/app/api/appointments/[id]/route');
    invoiceByIdRoute = await import('@/app/api/invoices/[id]/route');
    professionalsRoute = await import('@/app/api/professionals/route');
    suppliesRoute = await import('@/app/api/supplies/route');
    supplyMovementsRoute = await import(
      '@/app/api/supplies/[id]/movements/route'
    );
    followUpsRoute = await import('@/app/api/follow-ups/route');
    followUpByIdRoute = await import('@/app/api/follow-ups/[id]/route');
    reportsRoute = await import('@/app/api/reports/route');
    summaryRoute = await import('@/app/api/summary/route');

    const patientResponse = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'João Retorno',
        email: 'joao.retorno@example.com',
        phone: '11977776666',
      }),
    );
    const patientBody = (await patientResponse.json()) as Envelope<PatientDto>;
    patientId = patientBody.data.id;
  });

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  // Restaura spies mesmo quando um expect falha antes do mockRestore.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Cenário: POST /api/follow-ups', () => {
    it('Dado paciente existente, Quando POST /api/follow-ups, Então cria retorno pendente', async () => {
      const response = await followUpsRoute.POST(
        jsonRequest('/api/follow-ups', 'POST', {
          patientId,
          appointmentId: null,
          dueDate: '2026-08-01T10:00:00.000Z',
          reason: 'Revisão de curativo',
        }),
      );
      const body = (await response.json()) as Envelope<FollowUpDto>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('pending');
      expect(body.data.patientId).toBe(patientId);
      expect(body.data.reason).toBe('Revisão de curativo');
    });

    it('Dado paciente inexistente, Quando POST /api/follow-ups, Então retorna 404', async () => {
      const response = await followUpsRoute.POST(
        jsonRequest('/api/follow-ups', 'POST', {
          patientId: 'paciente-fantasma',
          dueDate: '2026-08-01T10:00:00.000Z',
          reason: 'Revisão de curativo',
        }),
      );

      expect(response.status).toBe(404);
    });

    it('Dado dueDate mal formatado, Quando POST /api/follow-ups, Então retorna 400 zod', async () => {
      const response = await followUpsRoute.POST(
        jsonRequest('/api/follow-ups', 'POST', {
          patientId,
          dueDate: '01-08-2026',
          reason: 'Revisão de curativo',
        }),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toContain('Dados inválidos');
    });
  });

  describe('Cenário: GET /api/follow-ups e PATCH /api/follow-ups/:id', () => {
    let doneFollowUpId: string;
    let cancelledFollowUpId: string;
    let overdueFollowUpId: string;

    beforeAll(async () => {
      const createDone = await followUpsRoute.POST(
        jsonRequest('/api/follow-ups', 'POST', {
          patientId,
          dueDate: '2026-09-01T10:00:00.000Z',
          reason: 'Retorno a ser concluído',
        }),
      );
      const doneBody = (await createDone.json()) as Envelope<FollowUpDto>;
      doneFollowUpId = doneBody.data.id;

      const createCancelled = await followUpsRoute.POST(
        jsonRequest('/api/follow-ups', 'POST', {
          patientId,
          dueDate: '2026-09-05T10:00:00.000Z',
          reason: 'Retorno a ser cancelado',
        }),
      );
      const cancelledBody =
        (await createCancelled.json()) as Envelope<FollowUpDto>;
      cancelledFollowUpId = cancelledBody.data.id;

      const createOverdue = await followUpsRoute.POST(
        jsonRequest('/api/follow-ups', 'POST', {
          patientId,
          dueDate: '2020-01-01T10:00:00.000Z',
          reason: 'Retorno vencido',
        }),
      );
      const overdueBody = (await createOverdue.json()) as Envelope<FollowUpDto>;
      overdueFollowUpId = overdueBody.data.id;
    });

    it('Dado retorno pendente, Quando PATCH status=done, Então marca como concluído', async () => {
      const response = await followUpByIdRoute.PATCH(
        jsonRequest(`/api/follow-ups/${doneFollowUpId}`, 'PATCH', {
          status: 'done',
        }),
        context(doneFollowUpId),
      );
      const body = (await response.json()) as Envelope<FollowUpDto>;

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('done');
    });

    it('Dado outro retorno pendente, Quando PATCH status=cancelled, Então marca como cancelado', async () => {
      const response = await followUpByIdRoute.PATCH(
        jsonRequest(`/api/follow-ups/${cancelledFollowUpId}`, 'PATCH', {
          status: 'cancelled',
        }),
        context(cancelledFollowUpId),
      );
      const body = (await response.json()) as Envelope<FollowUpDto>;

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('cancelled');
    });

    it('Dado id inexistente, Quando PATCH /api/follow-ups/:id, Então retorna 404', async () => {
      const response = await followUpByIdRoute.PATCH(
        jsonRequest('/api/follow-ups/fantasma', 'PATCH', { status: 'done' }),
        context('fantasma'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado status inválido, Quando PATCH /api/follow-ups/:id, Então retorna 400 zod', async () => {
      const response = await followUpByIdRoute.PATCH(
        jsonRequest(`/api/follow-ups/${doneFollowUpId}`, 'PATCH', {
          status: 'pending',
        }),
        context(doneFollowUpId),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toContain('Dados inválidos');
    });

    it('Dado filtro status=done, Quando GET /api/follow-ups, Então retorna apenas concluídos', async () => {
      const response = await followUpsRoute.GET(
        jsonRequest('/api/follow-ups?status=done', 'GET'),
      );
      const body = (await response.json()) as Envelope<FollowUpDto[]>;

      expect(response.status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data.every((f) => f.status === 'done')).toBe(true);
      expect(body.data.some((f) => f.id === doneFollowUpId)).toBe(true);
    });

    it('Dado filtro patientId, Quando GET /api/follow-ups, Então retorna retornos do paciente', async () => {
      const response = await followUpsRoute.GET(
        jsonRequest(`/api/follow-ups?patientId=${patientId}`, 'GET'),
      );
      const body = (await response.json()) as Envelope<FollowUpDto[]>;

      expect(response.status).toBe(200);
      expect(body.data.every((f) => f.patientId === patientId)).toBe(true);
      expect(body.data.some((f) => f.id === overdueFollowUpId)).toBe(true);
    });

    it('Dado retorno pendente com dueDate no passado, Quando GET /api/follow-ups, Então isOverdue é true', async () => {
      const response = await followUpsRoute.GET(
        jsonRequest('/api/follow-ups?status=pending', 'GET'),
      );
      const body = (await response.json()) as Envelope<FollowUpDto[]>;

      const overdue = body.data.find((f) => f.id === overdueFollowUpId);
      expect(overdue?.isOverdue).toBe(true);
    });

    it('Dado status inválido no filtro, Quando GET /api/follow-ups, Então retorna 400 zod', async () => {
      const response = await followUpsRoute.GET(
        jsonRequest('/api/follow-ups?status=finalizado', 'GET'),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toContain('Dados inválidos');
    });
  });

  describe('Cenário: GET /api/reports (relatório mensal)', () => {
    let reportPatientId: string;
    let reportAppointmentId: string;
    let reportInvoiceId: string;
    let reportSupplyId: string;
    let reportProfessionalId: string;
    // Faturas nascem com issuedAt = agora (Invoice.create), então o mês do
    // relatório precisa ser o mês corrente para capturar a fatura paga no summarize.
    const now = new Date();
    const reportMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    // Primeiro DIA ÚTIL do mês — dia 01 fixo cai fora do horário comercial
    // sempre que o mês começa em fim de semana.
    const firstBusinessDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12),
    );
    while (
      firstBusinessDay.getUTCDay() === 0 ||
      firstBusinessDay.getUTCDay() === 6
    ) {
      firstBusinessDay.setUTCDate(firstBusinessDay.getUTCDate() + 1);
    }
    const reportApptStart = firstBusinessDay.toISOString();
    const reportApptEnd = new Date(
      firstBusinessDay.getTime() + 60 * 60_000,
    ).toISOString();

    beforeAll(async () => {
      const patientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Relatório',
          email: 'relatorio@example.com',
          phone: '11966665555',
        }),
      );
      const patientBody =
        (await patientResponse.json()) as Envelope<PatientDto>;
      reportPatientId = patientBody.data.id;

      const professionalResponse = await professionalsRoute.POST(
        jsonRequest('/api/professionals', 'POST', {
          fullName: 'Dra. Relatório',
          registry: 'CRM-9999',
        }),
      );
      const professionalBody =
        (await professionalResponse.json()) as Envelope<ProfessionalDto>;
      reportProfessionalId = professionalBody.data.id;

      const supplyResponse = await suppliesRoute.POST(
        jsonRequest('/api/supplies', 'POST', {
          name: 'Gaze estéril',
          unit: 'unidade',
          minQty: 5,
          priceCents: 500,
        }),
      );
      const supplyBody = (await supplyResponse.json()) as Envelope<SupplyDto>;
      reportSupplyId = supplyBody.data.id;

      await supplyMovementsRoute.POST(
        jsonRequest(`/api/supplies/${reportSupplyId}/movements`, 'POST', {
          type: 'in',
          quantity: 100,
          reason: 'Compra inicial',
        }),
        context(reportSupplyId),
      );
      await supplyMovementsRoute.POST(
        jsonRequest(`/api/supplies/${reportSupplyId}/movements`, 'POST', {
          type: 'out',
          quantity: 10,
          reason: 'Uso avulso sem vínculo com consulta',
        }),
        context(reportSupplyId),
      );

      const appointmentResponse = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId: reportPatientId,
          startsAt: reportApptStart,
          endsAt: reportApptEnd,
          procedure: 'Curativo especial',
          priceCents: 30000,
        }),
      );
      const appointmentBody =
        (await appointmentResponse.json()) as Envelope<AppointmentDto>;
      reportAppointmentId = appointmentBody.data.id;

      const completeResponse = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${reportAppointmentId}`, 'PATCH', {
          action: 'complete',
        }),
        context(reportAppointmentId),
      );
      const completeBody = (await completeResponse.json()) as Envelope<{
        id: string;
        status: string;
      }>;
      expect(completeBody.data.status).toBe('completed');

      const invoicesRoute = await import('@/app/api/invoices/route');
      const invoicesResponse = await invoicesRoute.GET(
        jsonRequest(
          `/api/invoices?status=pending&patientId=${reportPatientId}`,
          'GET',
        ),
      );
      const invoicesBody = (await invoicesResponse.json()) as Envelope<
        InvoiceDto[]
      >;
      reportInvoiceId = invoicesBody.data[0].id;

      await invoiceByIdRoute.PATCH(
        jsonRequest(`/api/invoices/${reportInvoiceId}`, 'PATCH', {
          action: 'pay',
          method: 'pix',
        }),
        context(reportInvoiceId),
      );
    });

    it('Dado mês encerrado requisitado duas vezes, Quando GET /api/reports, Então a segunda vem do cache com payload idêntico (CONS2-11/13)', async () => {
      const { clearReportCache } = await import('@/lib/report-cache');
      const { GetMonthlyReport } = await import(
        '@/application/reports/get-monthly-report'
      );
      clearReportCache();
      const executeSpy = vi.spyOn(GetMonthlyReport.prototype, 'execute');

      const first = await reportsRoute.GET(
        jsonRequest('/api/reports?month=2020-01', 'GET'),
      );
      const second = await reportsRoute.GET(
        jsonRequest('/api/reports?month=2020-01', 'GET'),
      );
      const firstBody = (await first.json()) as Envelope<MonthlyReportDto>;
      const secondBody = (await second.json()) as Envelope<MonthlyReportDto>;

      expect(executeSpy).toHaveBeenCalledTimes(1);
      expect(secondBody).toEqual(firstBody);
      executeSpy.mockRestore();
      clearReportCache();
    });

    it('Dado mês corrente requisitado duas vezes, Quando GET /api/reports, Então recalcula a cada acesso (CONS2-12)', async () => {
      const { clearReportCache } = await import('@/lib/report-cache');
      const { GetMonthlyReport } = await import(
        '@/application/reports/get-monthly-report'
      );
      clearReportCache();
      const executeSpy = vi.spyOn(GetMonthlyReport.prototype, 'execute');

      await reportsRoute.GET(
        jsonRequest(`/api/reports?month=${reportMonth}`, 'GET'),
      );
      await reportsRoute.GET(
        jsonRequest(`/api/reports?month=${reportMonth}`, 'GET'),
      );

      expect(executeSpy).toHaveBeenCalledTimes(2);
      executeSpy.mockRestore();
    });

    it('Dado mês sem parâmetro, Quando GET /api/reports, Então usa mês atual e retorna 200', async () => {
      const response = await reportsRoute.GET(
        jsonRequest('/api/reports', 'GET'),
      );
      const body = (await response.json()) as Envelope<MonthlyReportDto>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(typeof body.data.totalAppointments).toBe('number');
      expect(body.data.byStatus).toBeDefined();
      expect(Array.isArray(body.data.revenueByProcedure)).toBe(true);
      expect(Array.isArray(body.data.productionByProfessional)).toBe(true);
      expect(body.data.billing).toBeDefined();
    });

    it('Dado month=YYYY-MM válido com dados de apoio, Quando GET /api/reports, Então totaliza consultas, faturamento e insumos', async () => {
      const response = await reportsRoute.GET(
        jsonRequest(`/api/reports?month=${reportMonth}`, 'GET'),
      );
      const body = (await response.json()) as Envelope<MonthlyReportDto>;

      expect(response.status).toBe(200);
      expect(body.data.totalAppointments).toBe(1);
      expect(body.data.byStatus.completed).toBe(1);
      expect(body.data.billing.paidCents).toBe(30000);
      expect(body.data.billing.paidCount).toBe(1);

      const procedureEntry = body.data.revenueByProcedure.find(
        (entry) => entry.procedure === 'Curativo especial',
      );
      expect(procedureEntry?.count).toBe(1);
      expect(procedureEntry?.totalCents).toBe(30000);

      // Saída de 10 unidades sem vínculo com consulta deve entrar como custo não atribuído.
      expect(body.data.unattributedSupplyCostCents).toBeGreaterThanOrEqual(
        5000,
      );
      expect(body.data.totalSupplyCostCents).toBeGreaterThanOrEqual(
        body.data.unattributedSupplyCostCents,
      );

      const production = body.data.productionByProfessional;
      expect(Array.isArray(production)).toBe(true);
      void reportProfessionalId;
    });

    it('Dado month mal formatado (2026-7), Quando GET /api/reports, Então retorna 400 direto', async () => {
      const response = await reportsRoute.GET(
        jsonRequest('/api/reports?month=2026-7', 'GET'),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toBe('Parâmetro month deve estar no formato YYYY-MM');
    });

    it('Dado month não numérico (julho), Quando GET /api/reports, Então retorna 400 direto', async () => {
      const response = await reportsRoute.GET(
        jsonRequest('/api/reports?month=julho', 'GET'),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toBe('Parâmetro month deve estar no formato YYYY-MM');
    });
  });

  describe('Cenário: GET /api/summary sem parâmetro month', () => {
    it('Dado nenhum parâmetro month, Quando GET /api/summary, Então usa mês/ano atuais e retorna estrutura válida', async () => {
      const response = await summaryRoute.GET(
        jsonRequest('/api/summary', 'GET'),
      );
      const body = (await response.json()) as Envelope<SummaryDto>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(typeof body.data.billing.paidCents).toBe('number');
      expect(typeof body.data.billing.paidCount).toBe('number');
      expect(typeof body.data.appointmentsInMonth).toBe('number');
      expect(Array.isArray(body.data.today)).toBe(true);
    });

    it('Dado month=abc, Quando GET /api/summary, Então retorna 400', async () => {
      const response = await summaryRoute.GET(
        jsonRequest('/api/summary?month=abc', 'GET'),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toBe('Parâmetro month deve estar no formato YYYY-MM');
    });
  });
});
