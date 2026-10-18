import { describe, expect, it } from 'vitest';
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

/**
 * Listas auxiliares da agenda, da lista de espera e do prontuário (#188/#189):
 * Atendente e Profissional leem profissionais e procedimentos por um DTO
 * reduzido, sem dado financeiro de comissão nem kit; a escrita no cadastro
 * continua exclusiva do Admin.
 */
describe('Feature: Listas auxiliares para a equipe (#188, #189)', () => {
  const atendente = (clinicId: string = CLINIC_A_ID) =>
    cookieHeaderFor('atendente', 'recepcao@x.com', clinicId);

  const createProfessional = async (
    clinicId: string,
    body: Record<string, unknown>,
  ): Promise<string> => {
    const route = await import('@/app/api/professionals/route');
    const response = await route.POST(
      jsonRequest(
        '/api/professionals',
        'POST',
        body,
        adminCookieHeader(clinicId),
      ),
    );
    const envelope = (await response.json()) as Envelope<{ id: string }>;
    return envelope.data.id;
  };

  const deactivateProfessional = async (id: string) => {
    const route = await import('@/app/api/professionals/[id]/route');
    await route.PATCH(
      jsonRequest(`/api/professionals/${id}`, 'PATCH', { active: false }),
      { params: Promise.resolve({ id }) },
    );
  };

  const createProcedure = async (name: string): Promise<string> => {
    const route = await import('@/app/api/procedures/route');
    const response = await route.POST(
      jsonRequest('/api/procedures', 'POST', {
        name,
        priceCents: 15000,
        durationMinutes: 45,
      }),
    );
    const envelope = (await response.json()) as Envelope<{ id: string }>;
    return envelope.data.id;
  };

  const listProfessionals = async (headers: Record<string, string>) => {
    const route = await import('@/app/api/options/professionals/route');
    return route.GET(
      jsonRequest('/api/options/professionals', 'GET', undefined, headers),
    );
  };

  it('C2 atendente lista profissionais sem dado financeiro', async () => {
    await ensureTestClinics();
    const activeId = await createProfessional(CLINIC_A_ID, {
      fullName: 'Enf. Opções Ativa',
      registry: 'COREN-1',
      commissionType: 'percentage',
      commissionPct: 30,
    });
    const inactiveId = await createProfessional(CLINIC_A_ID, {
      fullName: 'Enf. Opções Inativa',
    });
    await deactivateProfessional(inactiveId);

    const response = await listProfessionals(atendente());
    const body = (await response.json()) as Envelope<
      Array<Record<string, unknown>>
    >;

    expect(response.status).toBe(200);
    expect(body.data.find((p) => p.id === activeId)).toEqual({
      id: activeId,
      fullName: 'Enf. Opções Ativa',
      active: true,
    });
    expect(body.data.find((p) => p.id === inactiveId)).toEqual({
      id: inactiveId,
      fullName: 'Enf. Opções Inativa',
      active: false,
    });
    for (const item of body.data) {
      expect(Object.keys(item).sort()).toEqual(['active', 'fullName', 'id']);
    }
  });

  it('C3 atendente lista procedimentos com preço e duração', async () => {
    await ensureTestClinics();
    const id = await createProcedure('Curativo opções C3');

    const route = await import('@/app/api/options/procedures/route');
    const response = await route.GET(
      jsonRequest('/api/options/procedures', 'GET', undefined, atendente()),
    );
    const body = (await response.json()) as Envelope<
      Array<Record<string, unknown>>
    >;

    expect(response.status).toBe(200);
    expect(body.data.find((p) => p.id === id)).toEqual({
      id,
      name: 'Curativo opções C3',
      priceCents: 15000,
      durationMinutes: 45,
      active: true,
    });
    for (const item of body.data) {
      expect(Object.keys(item).sort()).toEqual([
        'active',
        'durationMinutes',
        'id',
        'name',
        'priceCents',
      ]);
    }
  });

  it('C3 escrita em profissionais e procedimentos continua só do admin', async () => {
    await ensureTestClinics();
    const professionalId = await createProfessional(CLINIC_A_ID, {
      fullName: 'Enf. Escrita Negada',
    });
    const procedureId = await createProcedure('Procedimento escrita negada');
    const professionals = await import('@/app/api/professionals/route');
    const professionalById = await import('@/app/api/professionals/[id]/route');
    const procedures = await import('@/app/api/procedures/route');
    const procedureById = await import('@/app/api/procedures/[id]/route');

    const responses = [
      await professionals.POST(
        jsonRequest(
          '/api/professionals',
          'POST',
          { fullName: 'X' },
          atendente(),
        ),
      ),
      await professionalById.PATCH(
        jsonRequest(
          `/api/professionals/${professionalId}`,
          'PATCH',
          { fullName: 'Y' },
          atendente(),
        ),
        { params: Promise.resolve({ id: professionalId }) },
      ),
      await procedures.POST(
        jsonRequest(
          '/api/procedures',
          'POST',
          { name: 'Z', priceCents: 1, durationMinutes: 30 },
          atendente(),
        ),
      ),
      await procedureById.PATCH(
        jsonRequest(
          `/api/procedures/${procedureId}`,
          'PATCH',
          { name: 'W' },
          atendente(),
        ),
        { params: Promise.resolve({ id: procedureId }) },
      ),
    ];

    for (const response of responses) {
      expect(response.status).toBe(403);
      const body = (await response.json()) as Envelope<null>;
      expect(body.error).toBe('Seu papel não tem acesso a este recurso');
    }
  });

  it('C5 lista só a empresa da sessão', async () => {
    await ensureTestClinics();
    const fromB = await createProfessional(CLINIC_B_ID, {
      fullName: 'Enf. Só da Clínica B',
    });

    const response = await listProfessionals(atendente(CLINIC_A_ID));
    const body = (await response.json()) as Envelope<Array<{ id: string }>>;

    expect(response.status).toBe(200);
    expect(body.data.some((p) => p.id === fromB)).toBe(false);
  });

  it('C8 profissional lista nomes de profissionais sem comissão', async () => {
    await ensureTestClinics();
    const id = await createProfessional(CLINIC_A_ID, {
      fullName: 'Enf. Colega',
      commissionType: 'fixed',
      commissionFixedCents: 5000,
    });

    const response = await listProfessionals(
      cookieHeaderFor('profissional', 'prof@x.com', CLINIC_A_ID, id),
    );
    const body = (await response.json()) as Envelope<
      Array<Record<string, unknown>>
    >;

    expect(response.status).toBe(200);
    expect(body.data.find((p) => p.id === id)).toEqual({
      id,
      fullName: 'Enf. Colega',
      active: true,
    });
  });
});
