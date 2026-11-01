import { beforeAll, describe, expect, it } from 'vitest';
import {
  type CollectionPath,
  collectionRoute,
  type ItemPath,
  itemRoute,
} from '../support/api-routes';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface PayoutBody {
  id: string;
  professionalId: string;
  period: string;
  totalCents: number;
  status: 'active' | 'cancelled';
  cancelReason: string | null;
  cancelledBy: string | null;
  rule: unknown;
}

// Meses exclusivos deste arquivo (a base PGlite é compartilhada entre testes).
const MAY = '2024-05';
const JUNE = '2024-06';

const post = async <T>(path: CollectionPath, body: unknown): Promise<T> => {
  const route = await collectionRoute(path);
  const response = await route.POST(jsonRequest(`/api${path}`, 'POST', body));
  const parsed = (await response.json()) as Envelope<T>;
  expect(parsed.error).toBeNull();
  return parsed.data;
};

const patch = async (path: ItemPath, id: string, body: unknown) => {
  const route = await itemRoute(path);
  const response = await route.PATCH(
    jsonRequest(`/api${path}/${id}`, 'PATCH', body),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(200);
};

const closePayout = async (professionalId: string, period: string) => {
  const route = await import('@/app/api/commission-payouts/route');
  return route.POST(
    jsonRequest('/api/commission-payouts', 'POST', {
      professionalId,
      period,
      paidAt: '2024-07-05',
      paymentMethod: 'pix',
    }),
  );
};

const cancelPayout = async (
  id: string,
  reason: string,
  headers: Record<string, string> = adminCookieHeader(),
) => {
  const route = await import('@/app/api/commission-payouts/[id]/cancel/route');
  return route.POST(
    jsonRequest(
      `/api/commission-payouts/${id}/cancel`,
      'POST',
      { reason },
      headers,
    ),
    { params: Promise.resolve({ id }) },
  );
};

const adminReceipt = async (id: string, headers: Record<string, string>) => {
  const route = await import('@/app/api/commission-payouts/[id]/route');
  return route.GET(
    jsonRequest(`/api/commission-payouts/${id}`, 'GET', undefined, headers),
    { params: Promise.resolve({ id }) },
  );
};

const ownReceipt = async (id: string, headers: Record<string, string>) => {
  const route = await import('@/app/api/my-payouts/[id]/route');
  return route.GET(
    jsonRequest(`/api/my-payouts/${id}`, 'GET', undefined, headers),
    { params: Promise.resolve({ id }) },
  );
};

const dataOf = async <T>(response: Response): Promise<T> =>
  ((await response.json()) as Envelope<T>).data;

describe('Feature: Cancelar repasse e comprovante (API, banco real)', () => {
  let carlaId: string;
  let daviId: string;
  let may: PayoutBody;
  let june: PayoutBody;

  const professionalHeaders = (professionalId: string) =>
    cookieHeaderFor(
      'profissional',
      'prof@clinica.com',
      CLINIC_A_ID,
      professionalId,
    );

  /** Sessão concluída no dia do mês indicado, com a fatura paga. */
  const paidSession = async (
    professionalId: string,
    period: string,
    day: string,
  ) => {
    const patient = await post<{ id: string }>('/patients', {
      fullName: `Paciente ${period}-${day}`,
      email: `cancel-${professionalId.slice(0, 6)}-${period}-${day}@x.com`,
      phone: '11999990000',
    });
    const appointment = await post<{ id: string }>('/appointments', {
      patientId: patient.id,
      professionalId,
      procedure: 'Curativo',
      priceCents: 15000,
      startsAt: `${period}-${day}T12:00:00.000Z`,
      endsAt: `${period}-${day}T13:00:00.000Z`,
    });
    await patch('/appointments', appointment.id, { action: 'complete' });
    const invoicesRoute = await import('@/app/api/invoices/route');
    const invoices = await dataOf<Array<{ id: string }>>(
      await invoicesRoute.GET(
        jsonRequest(`/api/invoices?patientId=${patient.id}`, 'GET'),
      ),
    );
    await patch('/invoices', invoices[0].id, { action: 'pay', method: 'pix' });
  };

  beforeAll(async () => {
    await ensureTestClinics();
    carlaId = (
      await post<{ id: string }>('/professionals', {
        fullName: 'Dra. Carla Cancel',
        registry: 'COREN-SP 777',
        commissionPct: 40,
      })
    ).id;
    daviId = (
      await post<{ id: string }>('/professionals', {
        fullName: 'Dr. Davi Cancel',
        commissionPct: 10,
      })
    ).id;
    await paidSession(carlaId, MAY, '10');
    await paidSession(carlaId, JUNE, '10');
    may = await dataOf<PayoutBody>(await closePayout(carlaId, MAY));
    june = await dataOf<PayoutBody>(await closePayout(carlaId, JUNE));
  });

  it('Dados dois repasses, Então o comprovante (Admin) traz regra, situação e registro do profissional', async () => {
    const response = await adminReceipt(may.id, adminCookieHeader());
    const receipt = await dataOf<{
      payout: PayoutBody;
      professional: { fullName: string; registry: string | null };
    }>(response);

    expect(response.status).toBe(200);
    expect(receipt.payout).toMatchObject({
      id: may.id,
      totalCents: 6000,
      status: 'active',
      rule: { kind: 'percentage', pct: 40 },
    });
    expect(receipt.professional).toEqual({
      fullName: 'Dra. Carla Cancel',
      registry: 'COREN-SP 777',
    });
  });

  it('Dado Profissional, Então lê o próprio comprovante e recebe 404 no alheio ou na rota do Admin', async () => {
    const carla = professionalHeaders(carlaId);
    expect((await ownReceipt(may.id, carla)).status).toBe(200);
    expect((await ownReceipt(may.id, professionalHeaders(daviId))).status).toBe(
      404,
    );
    expect((await ownReceipt('ghost', carla)).status).toBe(404);
    // Conta sem profissional vinculado não tem comprovante próprio.
    expect((await ownReceipt(may.id, adminCookieHeader())).status).toBe(404);
    expect((await adminReceipt(may.id, carla)).status).toBe(403);
  });

  it('Dado Atendente ou Admin de outra clínica, Então não lê o comprovante', async () => {
    const atendente = cookieHeaderFor('atendente', 'recepcao@clinica.com');
    expect((await adminReceipt(may.id, atendente)).status).toBe(403);
    expect((await ownReceipt(may.id, atendente)).status).toBe(403);
    expect(
      (await adminReceipt(may.id, adminCookieHeader(CLINIC_B_ID))).status,
    ).toBe(404);
  });

  it('Dado Profissional, Atendente ou outra clínica, Quando tentam cancelar, Então recusa', async () => {
    expect(
      (
        await cancelPayout(
          june.id,
          'valor errado',
          professionalHeaders(carlaId),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await cancelPayout(
          june.id,
          'valor errado',
          cookieHeaderFor('atendente', 'recepcao@clinica.com'),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await cancelPayout(
          june.id,
          'valor errado',
          adminCookieHeader(CLINIC_B_ID),
        )
      ).status,
    ).toBe(404);
  });

  it('Dado repasse mais antigo, Quando cancelar, Então 409; motivo curto, 400', async () => {
    const older = await cancelPayout(may.id, 'valor errado');
    expect(older.status).toBe(409);
    expect(((await older.json()) as Envelope<null>).error).toContain(JUNE);

    expect((await cancelPayout(june.id, 'x')).status).toBe(400);
  });

  it('Dado o repasse mais recente, Quando cancelar, Então audita, reabre o mês e permite fechar de novo', async () => {
    const response = await cancelPayout(june.id, 'registrado em dobro');
    const cancelled = await dataOf<PayoutBody>(response);
    expect(response.status).toBe(200);
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelReason: 'registrado em dobro',
    });
    expect((await cancelPayout(june.id, 'de novo, errado')).status).toBe(409);

    const listRoute = await import('@/app/api/commission-payouts/route');
    const overview = await dataOf<{
      rows: Array<{
        professionalId: string;
        payableCents: number;
        closedPayout: unknown;
      }>;
      history: PayoutBody[];
    }>(
      await listRoute.GET(
        jsonRequest(`/api/commission-payouts?month=${JUNE}`, 'GET'),
      ),
    );
    const carla = overview.rows.find((r) => r.professionalId === carlaId);
    expect(carla).toMatchObject({ payableCents: 6000, closedPayout: null });
    expect(overview.history.find((h) => h.id === june.id)?.status).toBe(
      'cancelled',
    );

    // Índices únicos parciais: o mês e a sessão voltam a ser pagáveis.
    const reclosed = await closePayout(carlaId, JUNE);
    expect(reclosed.status).toBe(200);
    expect((await dataOf<PayoutBody>(reclosed)).totalCents).toBe(6000);

    const auditRoute = await import('@/app/api/audit/route');
    const audit = await dataOf<
      Array<{ resourceType: string; resourceId: string; action: string }>
    >(await auditRoute.GET(jsonRequest('/api/audit?limit=100', 'GET')));
    expect(
      audit.some(
        (e) =>
          e.resourceType === 'commission-payout' &&
          e.resourceId === june.id &&
          e.action === 'update',
      ),
    ).toBe(true);
  });

  it('Dado comprovante de repasse, Quando emitido duas vezes, Então o número (REP-) é o mesmo', async () => {
    const issue = async () =>
      post<{ documentNumber: string; issuedAt: string }>('/documents/issue', {
        documentType: 'repasse',
        resourceId: may.id,
      });
    const first = await issue();
    expect(first.documentNumber).toMatch(/^REP-[0-9A-F]{8}$/);
    expect(await issue()).toEqual(first);
  });
});
