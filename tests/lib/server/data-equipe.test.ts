import { describe, expect, it } from 'vitest';
import type { Session } from '@/lib/auth/session';
import {
  getProfessionalHoursFor,
  listProfessionalsFor,
} from '@/lib/server/data/professionals';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../../support/clinics';
import { jsonRequest } from '../../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const session = (clinicId: string): Session =>
  ({
    role: 'company_admin',
    subject: 'admin@clinica.com',
    clinicId,
    professionalId: null,
  }) as unknown as Session;

const body = async <T>(response: Response): Promise<T> =>
  ((await response.json()) as { data: T }).data;

describe('Feature: leitura de Profissionais no servidor (#550)', () => {
  it('Dado profissional cadastrado, Quando lê pela camada de dados, Então devolve o mesmo que GET /api/professionals, com repasse', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/professionals/route');
    await route.POST(
      jsonRequest('/api/professionals', 'POST', {
        fullName: 'Dra. Paridade',
        registry: 'COREN-SP 77',
        commissionPct: 25,
      }),
    );

    const viaRoute = await body<Array<{ fullName: string }>>(
      await route.GET(jsonRequest('/api/professionals', 'GET')),
    );

    const listed = await listProfessionalsFor(session(CLINIC_A_ID));
    expect(listed).toEqual(viaRoute);
    expect(listed.find((p) => p.fullName === 'Dra. Paridade')).toMatchObject({
      registry: 'COREN-SP 77',
      commissionPct: 25,
      active: true,
    });
  });

  it('Dado profissional da clínica A, Quando a clínica B lista, Então não vê o profissional da A', async () => {
    await ensureTestClinics();

    const listed = await listProfessionalsFor(session(CLINIC_B_ID));

    expect(listed.map((p) => p.fullName)).not.toContain('Dra. Paridade');
  });

  it('Dado profissional com horário, Quando lê pela camada de dados, Então devolve o mesmo que GET /api/professionals/:id/availability', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/professionals/route');
    const hours = await import(
      '@/app/api/professionals/[id]/availability/route'
    );
    const professional = await body<{ id: string }>(
      await route.POST(
        jsonRequest('/api/professionals', 'POST', {
          fullName: 'Dr. Horário',
        }),
      ),
    );
    const params = { params: Promise.resolve({ id: professional.id }) };
    const monday = { weekday: 1, startMinute: 480, endMinute: 720 };
    await hours.PUT(
      jsonRequest(`/api/professionals/${professional.id}/availability`, 'PUT', {
        windows: [monday],
      }),
      params,
    );

    const viaRoute = await body(
      await hours.GET(
        jsonRequest(
          `/api/professionals/${professional.id}/availability`,
          'GET',
        ),
        params,
      ),
    );

    expect(
      await getProfessionalHoursFor(session(CLINIC_A_ID), professional.id),
    ).toEqual(viaRoute);
    expect(viaRoute).toEqual({ windows: [monday] });
  });

  it('Dado profissional da clínica A, Quando a clínica B lê o horário, Então responde não encontrado', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/professionals/route');
    const professional = await body<{ id: string }>(
      await route.POST(
        jsonRequest('/api/professionals', 'POST', { fullName: 'Só da A' }),
      ),
    );

    await expect(
      getProfessionalHoursFor(session(CLINIC_B_ID), professional.id),
    ).rejects.toThrow('Profissional');
  });
});
