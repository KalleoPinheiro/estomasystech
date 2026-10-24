import { beforeAll, describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
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
}

interface Row {
  id: string;
  status: string;
  professionalId: string | null;
}

const FROM = '2027-09-01T00:00:00.000Z';
const TO = '2027-09-30T00:00:00.000Z';
const range = `from=${FROM}&to=${TO}`;

/**
 * Issue #538: filtro de status da agenda. O recorte é aplicado no servidor,
 * dentro do escopo de empresa, e combina com o filtro de profissional.
 */
describe('Feature: Filtrar a agenda por status da consulta (#538)', () => {
  let anaId: string;
  let brunoId: string;

  const post = async <T>(
    path: string,
    body: Record<string, unknown>,
    clinicId: string,
  ): Promise<T> => {
    const route =
      path === '/api/patients'
        ? await import('@/app/api/patients/route')
        : path === '/api/professionals'
          ? await import('@/app/api/professionals/route')
          : await import('@/app/api/appointments/route');
    const response = await route.POST(
      jsonRequest(path, 'POST', body, adminCookieHeader(clinicId)),
    );
    const result = (await response.json()) as Envelope<T> & {
      error?: string;
    };
    if (!result.success) throw new Error(`${path}: ${result.error}`);
    return result.data;
  };

  const patientFor = async (clinicId: string, email: string) =>
    (
      await post<{ id: string }>(
        '/api/patients',
        { fullName: 'Paciente Filtro', email, phone: '11999990000' },
        clinicId,
      )
    ).id;

  const book = async (
    clinicId: string,
    patientId: string,
    day: string,
    hour: string,
    professionalId: string | null,
    outcome: 'confirm' | 'cancel' | 'no_show' | 'complete' | null,
  ) => {
    const created = await post<{ id: string }>(
      '/api/appointments',
      {
        patientId,
        startsAt: `2027-09-${day}T${hour}:00:00.000Z`,
        endsAt: `2027-09-${day}T${hour.replace(/^\d\d/, (h) => String(Number(h) + 1).padStart(2, '0'))}:00:00.000Z`,
        procedure: 'Troca de bolsa',
        priceCents: 15000,
        professionalId,
      },
      clinicId,
    );
    if (outcome) {
      const { appointments } = await getRepositories(clinicScope(clinicId));
      const found = await appointments.findById(created.id);
      if (!found) throw new Error('Consulta de teste não criada');
      const next =
        outcome === 'confirm'
          ? found.confirm()
          : outcome === 'cancel'
            ? found.cancel({ by: 'clinic', reason: null })
            : outcome === 'no_show'
              ? found.markNoShow()
              : found.complete();
      await appointments.save(next);
    }
  };

  const get = async (
    path: string,
    headers: Record<string, string> = adminCookieHeader(CLINIC_A_ID),
  ) => {
    const route = path.startsWith('/api/appointments/status-counts')
      ? await import('@/app/api/appointments/status-counts/route')
      : await import('@/app/api/appointments/route');
    return route.GET(jsonRequest(path, 'GET', undefined, headers));
  };

  const statusesOf = async (
    query: string,
    headers?: Record<string, string>,
  ) => {
    const response = await get(`/api/appointments?${range}${query}`, headers);
    expect(response.status).toBe(200);
    const rows = ((await response.json()) as Envelope<Row[]>).data;
    return rows.map((r) => r.status).sort();
  };

  beforeAll(async () => {
    await ensureTestClinics();
    anaId = (
      await post<{ id: string }>(
        '/api/professionals',
        { fullName: 'Ana Filtro' },
        CLINIC_A_ID,
      )
    ).id;
    brunoId = (
      await post<{ id: string }>(
        '/api/professionals',
        { fullName: 'Bruno Filtro' },
        CLINIC_A_ID,
      )
    ).id;
    const patientA = await patientFor(CLINIC_A_ID, 'filtro-a@x.com');
    const patientB = await patientFor(CLINIC_B_ID, 'filtro-b@x.com');
    // Empresa A: Ana (2 confirmadas, 1 agendada, 1 cancelada); Bruno (1 confirmada, 1 falta, 1 concluída).
    await book(CLINIC_A_ID, patientA, '01', '09', anaId, 'confirm');
    await book(CLINIC_A_ID, patientA, '02', '09', anaId, 'confirm');
    await book(CLINIC_A_ID, patientA, '03', '09', anaId, null);
    await book(CLINIC_A_ID, patientA, '06', '09', anaId, 'cancel');
    await book(CLINIC_A_ID, patientA, '07', '09', brunoId, 'confirm');
    await book(CLINIC_A_ID, patientA, '08', '09', brunoId, 'no_show');
    await book(CLINIC_A_ID, patientA, '09', '09', brunoId, 'complete');
    // Empresa B: uma concluída que nunca pode aparecer para a A.
    await book(CLINIC_B_ID, patientB, '10', '09', null, 'complete');
  });

  it('AGE-FLT-03: Dado status=completed, Quando GET, Então só concluídas da empresa da sessão', async () => {
    expect(await statusesOf('&status=completed')).toEqual(['completed']);
  });

  it('AGE-FLT-01: Dado dois status, Quando GET, Então só esses dois', async () => {
    expect(await statusesOf('&status=confirmed,no_show')).toEqual([
      'confirmed',
      'confirmed',
      'confirmed',
      'no_show',
    ]);
  });

  it('AGE-FLT-01: Dado status vazio, Quando GET, Então lista vazia', async () => {
    expect(await statusesOf('&status=')).toEqual([]);
  });

  it('AGE-FLT-04: Dado status inválido, Quando GET, Então aplica o padrão sem erro', async () => {
    expect(await statusesOf('&status=xyz')).toEqual([
      'completed',
      'confirmed',
      'confirmed',
      'confirmed',
      'no_show',
      'scheduled',
    ]);
  });

  it('Dado a chamada sem status, Quando GET, Então mantém o contrato anterior (todos)', async () => {
    expect(await statusesOf('')).toHaveLength(7);
  });

  it('AGE-FLT-06: Dado Ana e confirmada, Quando GET, Então 2 consultas', async () => {
    const response = await get(
      `/api/appointments?${range}&status=confirmed&professionalId=${anaId}`,
    );
    const rows = ((await response.json()) as Envelope<Row[]>).data;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.professionalId === anaId)).toBe(true);
  });

  it('AGE-FLT-05: Dado o período, Quando contar, Então todos os status da empresa, sem filtro de status', async () => {
    const response = await get(`/api/appointments/status-counts?${range}`);
    expect(((await response.json()) as Envelope<unknown>).data).toEqual({
      scheduled: 1,
      confirmed: 3,
      completed: 1,
      cancelled: 1,
      no_show: 1,
    });
  });

  it('AGE-FLT-05: Dado Ana, Quando contar, Então só as dela', async () => {
    const response = await get(
      `/api/appointments/status-counts?${range}&professionalId=${anaId}`,
    );
    expect(((await response.json()) as Envelope<unknown>).data).toEqual({
      scheduled: 1,
      confirmed: 2,
      completed: 0,
      cancelled: 1,
      no_show: 0,
    });
  });

  it('Dado a sessão de Profissional, Quando contar, Então só a própria agenda e ignora professionalId', async () => {
    const headers = cookieHeaderFor(
      'profissional',
      'ana@x.com',
      CLINIC_A_ID,
      anaId,
    );
    const response = await get(
      `/api/appointments/status-counts?${range}&professionalId=${brunoId}`,
      headers,
    );
    expect(
      ((await response.json()) as Envelope<Record<string, number>>).data
        .confirmed,
    ).toBe(2);
  });

  it('Dado Profissional sem vínculo de conta, Quando contar, Então zeros (nunca agenda alheia)', async () => {
    const headers = cookieHeaderFor(
      'profissional',
      'sem@x.com',
      CLINIC_A_ID,
      null,
    );
    const response = await get(
      `/api/appointments/status-counts?${range}`,
      headers,
    );
    expect(((await response.json()) as Envelope<unknown>).data).toEqual({
      scheduled: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    });
  });

  it('Dado a empresa B, Quando contar, Então não vê as consultas da A', async () => {
    const response = await get(
      `/api/appointments/status-counts?${range}`,
      adminCookieHeader(CLINIC_B_ID),
    );
    expect(
      ((await response.json()) as Envelope<Record<string, number>>).data
        .completed,
    ).toBe(1);
  });

  it('Dado from/to ausentes, Quando contar, Então 400', async () => {
    const response = await get('/api/appointments/status-counts');
    expect(response.status).toBe(400);
  });

  it('Dado a chamada sem sessão, Quando contar, Então 401', async () => {
    const response = await get('/api/appointments/status-counts?' + range, {
      cookie: '',
    });
    expect(response.status).toBe(401);
  });
});
