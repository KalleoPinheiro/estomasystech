import { beforeAll, describe, expect, it } from 'vitest';
import { CommissionPayout } from '@/domain/billing/commission-payout';
import { ConflictError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface StatementRow {
  professionalId: string;
  payableCents: number;
  closedPayout: { id: string; totalCents: number } | null;
}

interface PayoutsBody {
  scope: 'clinic' | 'own';
  period: string;
  rows: StatementRow[];
  history: Array<{ id: string; professionalId: string; totalCents: number }>;
}

// Mês exclusivo deste arquivo (a base PGlite é compartilhada entre testes).
const PERIOD = '2025-03';

const post = async <T>(path: string, body: unknown): Promise<T> => {
  const route = await import(`@/app/api${path}/route`);
  const response = await route.POST(jsonRequest(`/api${path}`, 'POST', body));
  const parsed = (await response.json()) as Envelope<T>;
  expect(parsed.error).toBeNull();
  return parsed.data;
};

const patch = async (path: string, id: string, body: unknown) => {
  const route = await import(`@/app/api${path}/[id]/route`);
  const response = await route.PATCH(
    jsonRequest(`/api${path}/${id}`, 'PATCH', body),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(200);
};

const getPayouts = async (headers: Record<string, string>) => {
  const route = await import('@/app/api/commission-payouts/route');
  return route.GET(
    jsonRequest(
      `/api/commission-payouts?month=${PERIOD}`,
      'GET',
      undefined,
      headers,
    ),
  );
};

const getMyPayouts = async (headers: Record<string, string>) => {
  const route = await import('@/app/api/my-payouts/route');
  return route.GET(
    jsonRequest(`/api/my-payouts?month=${PERIOD}`, 'GET', undefined, headers),
  );
};

const closePayout = async (
  professionalId: string,
  headers: Record<string, string> = adminCookieHeader(),
) => {
  const route = await import('@/app/api/commission-payouts/route');
  return route.POST(
    jsonRequest(
      '/api/commission-payouts',
      'POST',
      {
        professionalId,
        period: PERIOD,
        paidAt: '2025-04-05',
        paymentMethod: 'pix',
      },
      headers,
    ),
  );
};

describe('Feature: Livro de repasses (API, banco real)', () => {
  let anaId: string;
  let brunoId: string;

  /** Sessão concluída em março/2025 com a fatura paga. */
  const paidSession = async (professionalId: string, day: string) => {
    const patient = await post<{ id: string }>('/patients', {
      fullName: `Paciente ${day}`,
      email: `repasse-${professionalId.slice(0, 6)}-${day}@x.com`,
      phone: '11999990000',
    });
    const appointment = await post<{ id: string }>('/appointments', {
      patientId: patient.id,
      professionalId,
      procedure: 'Curativo',
      priceCents: 15000,
      startsAt: `${PERIOD}-${day}T12:00:00.000Z`,
      endsAt: `${PERIOD}-${day}T13:00:00.000Z`,
    });
    await patch('/appointments', appointment.id, { action: 'complete' });
    const invoicesRoute = await import('@/app/api/invoices/route');
    const invoices = (
      (await (
        await invoicesRoute.GET(
          jsonRequest(`/api/invoices?patientId=${patient.id}`, 'GET'),
        )
      ).json()) as Envelope<Array<{ id: string }>>
    ).data;
    await patch('/invoices', invoices[0].id, { action: 'pay', method: 'pix' });
  };

  beforeAll(async () => {
    await ensureTestClinics();
    anaId = (
      await post<{ id: string }>('/professionals', {
        fullName: 'Dra. Ana Repasse',
        commissionPct: 40,
      })
    ).id;
    brunoId = (
      await post<{ id: string }>('/professionals', {
        fullName: 'Dr. Bruno Repasse',
        commissionType: 'fixed',
        commissionFixedCents: 5000,
      })
    ).id;
    await paidSession(anaId, '10');
    await paidSession(brunoId, '11');
  });

  it('Dado Admin, Quando abre o mês, Então vê o saldo de cada profissional pela regra dele', async () => {
    const response = await getPayouts(adminCookieHeader());
    const body = ((await response.json()) as Envelope<PayoutsBody>).data;

    expect(body.scope).toBe('clinic');
    const ana = body.rows.find((r) => r.professionalId === anaId);
    const bruno = body.rows.find((r) => r.professionalId === brunoId);
    expect(ana?.payableCents).toBe(6000); // 40% de R$ 150
    expect(bruno?.payableCents).toBe(5000); // fixo por sessão
  });

  it('Dado Admin, Quando registra o repasse, Então grava, audita e não permite pagar de novo', async () => {
    const first = await closePayout(anaId);
    const payout = ((await first.json()) as Envelope<{ totalCents: number }>)
      .data;
    expect(first.status).toBe(200);
    expect(payout.totalCents).toBe(6000);

    const again = await closePayout(anaId);
    expect(again.status).toBe(409);

    const body = (
      (await (
        await getPayouts(adminCookieHeader())
      ).json()) as Envelope<PayoutsBody>
    ).data;
    const ana = body.rows.find((r) => r.professionalId === anaId);
    expect(ana?.closedPayout?.totalCents).toBe(6000);
    expect(body.history.some((h) => h.professionalId === anaId)).toBe(true);

    const auditRoute = await import('@/app/api/audit/route');
    const audit = (
      (await (
        await auditRoute.GET(jsonRequest('/api/audit?limit=50', 'GET'))
      ).json()) as Envelope<Array<{ resourceType: string }>>
    ).data;
    expect(audit.some((e) => e.resourceType === 'commission-payout')).toBe(
      true,
    );
  });

  it('Dado Profissional, Quando abre repasses, Então vê só o próprio extrato e não registra repasse', async () => {
    const headers = cookieHeaderFor(
      'profissional',
      'bruno@clinica.com',
      CLINIC_A_ID,
      brunoId,
    );
    const body = (
      (await (await getMyPayouts(headers)).json()) as Envelope<PayoutsBody>
    ).data;

    expect(body.scope).toBe('own');
    expect(body.rows.map((r) => r.professionalId)).toEqual([brunoId]);
    expect(body.history.every((h) => h.professionalId === brunoId)).toBe(true);
    expect((await closePayout(brunoId, headers)).status).toBe(403);
    // A visão da clínica é só do Admin.
    expect((await getPayouts(headers)).status).toBe(403);
  });

  it('Dado conta sem profissional vinculado (ex.: Admin), Quando pede o extrato próprio, Então vem vazio', async () => {
    const body = (
      (await (
        await getMyPayouts(adminCookieHeader())
      ).json()) as Envelope<PayoutsBody>
    ).data;
    expect(body).toMatchObject({ scope: 'own', rows: [], history: [] });
  });

  it('Dado Atendente, Quando acessa repasses, Então 403 nas duas visões', async () => {
    const headers = cookieHeaderFor('atendente', 'recepcao@clinica.com');
    expect((await getPayouts(headers)).status).toBe(403);
    expect((await getMyPayouts(headers)).status).toBe(403);
    expect((await closePayout(brunoId, headers)).status).toBe(403);
  });

  it('Dado Admin de outra clínica, Quando abre repasses, Então não vê profissionais da clínica A nem fecha repasse deles', async () => {
    const body = (
      (await (
        await getPayouts(adminCookieHeader(CLINIC_B_ID))
      ).json()) as Envelope<PayoutsBody>
    ).data;
    expect(body.rows.map((r) => r.professionalId)).not.toContain(brunoId);
    expect(body.history.map((h) => h.professionalId)).not.toContain(anaId);

    const response = await closePayout(brunoId, adminCookieHeader(CLINIC_B_ID));
    expect(response.status).toBe(404);
  });

  it('Dada sessão já paga, Quando outro repasse tenta pagá-la (corrida entre dois Admins), Então o banco barra com ConflictError', async () => {
    const { commissionPayouts } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    const [paidItem] = await commissionPayouts.findPaidItems(anaId);
    const duplicate = CommissionPayout.create({
      professionalId: anaId,
      period: '2025-01',
      paidAt: new Date('2025-02-05T12:00:00'),
      paymentMethod: 'pix',
      createdBy: 'outro-admin@clinica.com',
      rule: { kind: 'percentage', pct: 40 },
      items: [
        {
          appointmentId: paidItem.appointmentId,
          kind: 'session',
          procedure: 'Curativo',
          sessionDate: new Date('2025-01-10T12:00:00'),
          baseCents: 15000,
          commissionCents: 6000,
        },
      ],
    });

    await expect(commissionPayouts.save(duplicate)).rejects.toThrow(
      ConflictError,
    );
    // A transação desfaz o cabeçalho do repasse também.
    expect(await commissionPayouts.findAll({ period: '2025-01' })).toEqual([]);
  });

  it('Dado mês com formato inválido, Quando consultar, Então 400', async () => {
    const admin = await import('@/app/api/commission-payouts/route');
    const own = await import('@/app/api/my-payouts/route');
    expect(
      (
        await admin.GET(
          jsonRequest('/api/commission-payouts?month=2025-3', 'GET'),
        )
      ).status,
    ).toBe(400);
    expect(
      (await own.GET(jsonRequest('/api/my-payouts?month=2025-3', 'GET')))
        .status,
    ).toBe(400);
  });
});
