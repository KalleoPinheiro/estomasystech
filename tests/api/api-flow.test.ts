import { beforeAll, describe, expect, it, vi } from 'vitest';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Fluxo completo da API (paciente → consulta → fatura → resumo)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientByIdRoute: typeof import('@/app/api/patients/[id]/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  let appointmentByIdRoute: typeof import('@/app/api/appointments/[id]/route');
  let invoicesRoute: typeof import('@/app/api/invoices/route');
  let invoiceByIdRoute: typeof import('@/app/api/invoices/[id]/route');
  let summaryRoute: typeof import('@/app/api/summary/route');

  let patientId: string;
  let appointmentId: string;
  let invoiceId: string;

  beforeAll(async () => {
    patientsRoute = await import('@/app/api/patients/route');
    patientByIdRoute = await import('@/app/api/patients/[id]/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    appointmentByIdRoute = await import('@/app/api/appointments/[id]/route');
    invoicesRoute = await import('@/app/api/invoices/route');
    invoiceByIdRoute = await import('@/app/api/invoices/[id]/route');
    summaryRoute = await import('@/app/api/summary/route');
  });

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  it('Dado dados válidos, Quando POST /api/patients, Então cria paciente', async () => {
    const response = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Maria da Silva',
        email: 'maria@example.com',
        phone: '11999990000',
      }),
    );
    const body = (await response.json()) as Envelope<{
      id: string;
      fullName: string;
    }>;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.fullName).toBe('Maria da Silva');
    patientId = body.data.id;
  });

  it('Dado paciente criado, Quando POST /api/patients, Então registra evento de auditoria (#71)', async () => {
    const { getRepositories } = await import('@/infrastructure/container');
    const { auditEvents } = await getRepositories(clinicScope('legacy-clinic'));

    const events = await auditEvents.findAll();
    const event = events.find(
      (e) => e.resourceType === 'patient' && e.resourceId === patientId,
    );

    expect(event).toBeDefined();
    expect(event?.action).toBe('create');
    expect(event?.patientId).toBe(patientId);
  });

  it('Dado e-mail já usado por outro paciente, Quando POST /api/patients, Então aceita: e-mail de contato é repetível (#325)', async () => {
    const response = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Maria Clone',
        email: 'maria@example.com',
        phone: '11988880000',
      }),
    );

    expect(response.status).toBe(200);
  });

  it('Dado body sem campos, Quando POST /api/patients, Então retorna 400 com detalhe zod', async () => {
    const response = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {}),
    );
    const body = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(400);
    expect(body.error).toContain('Dados inválidos');
  });

  it('Dado paciente criado, Quando GET /api/patients/:id, Então retorna paciente', async () => {
    const response = await patientByIdRoute.GET(
      jsonRequest(`/api/patients/${patientId}`, 'GET'),
      context(patientId),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;

    expect(body.data.id).toBe(patientId);
  });

  it('Dado horário livre, Quando POST /api/appointments, Então agenda consulta', async () => {
    const response = await appointmentsRoute.POST(
      jsonRequest('/api/appointments', 'POST', {
        patientId,
        startsAt: '2026-07-20T12:00:00.000Z',
        endsAt: '2026-07-20T13:00:00.000Z',
        procedure: 'Troca de bolsa de colostomia',
        priceCents: 25000,
      }),
    );
    const body = (await response.json()) as Envelope<{
      id: string;
      status: string;
    }>;

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('scheduled');
    appointmentId = body.data.id;
  });

  it('Dado horário ocupado, Quando POST /api/appointments sobreposto, Então retorna 409', async () => {
    const response = await appointmentsRoute.POST(
      jsonRequest('/api/appointments', 'POST', {
        patientId,
        startsAt: '2026-07-20T12:30:00.000Z',
        endsAt: '2026-07-20T13:30:00.000Z',
        procedure: 'Avaliação',
        priceCents: 20000,
      }),
    );

    expect(response.status).toBe(409);
  });

  it('Dado período do mês, Quando GET /api/appointments, Então lista com nome do paciente', async () => {
    const response = await appointmentsRoute.GET(
      jsonRequest(
        '/api/appointments?from=2026-07-01T00:00:00.000Z&to=2026-08-01T00:00:00.000Z',
        'GET',
      ),
    );
    const body = (await response.json()) as Envelope<
      Array<{ patientName: string }>
    >;

    expect(body.data).toHaveLength(1);
    expect(body.data[0].patientName).toBe('Maria da Silva');
  });

  it('Dado GET /api/appointments sem período, Então retorna 400', async () => {
    const response = await appointmentsRoute.GET(
      jsonRequest('/api/appointments', 'GET'),
    );

    expect(response.status).toBe(400);
  });

  it('Dado falha ao gravar a fatura, Quando PATCH complete, Então rollback total — consulta segue agendada (CONS2-01)', async () => {
    const { DrizzleInvoiceRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-invoice-repository'
    );
    const saveSpy = vi
      .spyOn(DrizzleInvoiceRepository.prototype, 'save')
      .mockRejectedValueOnce(new Error('falha simulada na fatura'));

    try {
      const response = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${appointmentId}`, 'PATCH', {
          action: 'complete',
        }),
        context(appointmentId),
      );
      expect(response.status).toBe(500);

      const after = await appointmentByIdRoute.GET(
        jsonRequest(`/api/appointments/${appointmentId}`, 'GET'),
        context(appointmentId),
      );
      const afterBody = (await after.json()) as Envelope<{ status: string }>;
      expect(afterBody.data.status).toBe('scheduled');

      const invoicesResponse = await invoicesRoute.GET(
        jsonRequest('/api/invoices?status=pending', 'GET'),
      );
      const invoices = (await invoicesResponse.json()) as Envelope<unknown[]>;
      expect(invoices.data).toHaveLength(0);
    } finally {
      // Spy de prototype vaza para os testes seguintes se um expect falhar antes.
      saveSpy.mockRestore();
    }
  });

  it('Dado consulta agendada, Quando PATCH complete, Então conclui e gera fatura pendente', async () => {
    const response = await appointmentByIdRoute.PATCH(
      jsonRequest(`/api/appointments/${appointmentId}`, 'PATCH', {
        action: 'complete',
      }),
      context(appointmentId),
    );
    const body = (await response.json()) as Envelope<{ status: string }>;

    expect(body.data.status).toBe('completed');

    const invoicesResponse = await invoicesRoute.GET(
      jsonRequest('/api/invoices?status=pending', 'GET'),
    );
    const invoices = (await invoicesResponse.json()) as Envelope<
      Array<{ id: string; amountCents: number; appointmentId: string }>
    >;

    expect(invoices.data).toHaveLength(1);
    expect(invoices.data[0].amountCents).toBe(25000);
    expect(invoices.data[0].appointmentId).toBe(appointmentId);
    invoiceId = invoices.data[0].id;
  });

  it('Dado consulta concluída, Quando PATCH cancel, Então retorna 409', async () => {
    const response = await appointmentByIdRoute.PATCH(
      jsonRequest(`/api/appointments/${appointmentId}`, 'PATCH', {
        action: 'cancel',
      }),
      context(appointmentId),
    );

    expect(response.status).toBe(409);
  });

  it('Dado fatura pendente, Quando PATCH pay via pix, Então marca como paga', async () => {
    const response = await invoiceByIdRoute.PATCH(
      jsonRequest(`/api/invoices/${invoiceId}`, 'PATCH', {
        action: 'pay',
        method: 'pix',
      }),
      context(invoiceId),
    );
    const body = (await response.json()) as Envelope<{
      status: string;
      paymentMethod: string;
    }>;

    expect(body.data.status).toBe('paid');
    expect(body.data.paymentMethod).toBe('pix');
  });

  it('Dado fatura paga, Quando PATCH cancel, Então retorna 409', async () => {
    const response = await invoiceByIdRoute.PATCH(
      jsonRequest(`/api/invoices/${invoiceId}`, 'PATCH', { action: 'cancel' }),
      context(invoiceId),
    );

    expect(response.status).toBe(409);
  });

  it('Dado movimento do mês, Quando GET /api/summary, Então totaliza faturamento', async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const response = await summaryRoute.GET(
      jsonRequest(`/api/summary?month=${month}`, 'GET'),
    );
    const body = (await response.json()) as Envelope<{
      billing: { paidCents: number; paidCount: number };
    }>;

    expect(response.status).toBe(200);
    expect(body.data.billing.paidCents).toBe(25000);
    expect(body.data.billing.paidCount).toBe(1);
  });

  it('Dado month inválido, Quando GET /api/summary, Então retorna 400', async () => {
    const response = await summaryRoute.GET(
      jsonRequest('/api/summary?month=2026-7', 'GET'),
    );

    expect(response.status).toBe(400);
  });

  it('Dado id inexistente, Quando PATCH /api/appointments/:id, Então retorna 404', async () => {
    const response = await appointmentByIdRoute.PATCH(
      jsonRequest('/api/appointments/ghost', 'PATCH', { action: 'confirm' }),
      context('ghost'),
    );

    expect(response.status).toBe(404);
  });

  it('Dado paciente ativo, Quando PATCH active=false, Então desativa e bloqueia agendamento', async () => {
    const response = await patientByIdRoute.PATCH(
      jsonRequest(`/api/patients/${patientId}`, 'PATCH', { active: false }),
      context(patientId),
    );
    const body = (await response.json()) as Envelope<{ active: boolean }>;

    expect(body.data.active).toBe(false);

    const scheduleResponse = await appointmentsRoute.POST(
      jsonRequest('/api/appointments', 'POST', {
        patientId,
        startsAt: '2026-07-22T12:00:00.000Z',
        endsAt: '2026-07-22T13:00:00.000Z',
        procedure: 'Avaliação',
        priceCents: 20000,
      }),
    );

    expect(scheduleResponse.status).toBe(400);
  });
});
