import { describe, expect, it } from 'vitest';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

/**
 * Escopo dinâmico do Profissional (R4/RBAC-17,19) nas rotas de LISTAGEM —
 * complementa professional-patient-scope-guard.test.ts (T18), que cobre só
 * o acesso a um paciente individual. Sem este filtro, GET /api/patients e
 * GET /api/appointments vazavam todo o cadastro/agenda da clínica para
 * qualquer sessão profissional, mesmo sem vínculo.
 */
describe('Feature: Escopo do Profissional em listagens (RBAC-17/19)', () => {
  const createProfessional = async (fullName: string) => {
    const route = await import('@/app/api/professionals/route');
    const response = await route.POST(
      jsonRequest(
        '/api/professionals',
        'POST',
        { fullName },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  const createPatientAs = async (
    fullName: string,
    email: string,
    professionalId?: string,
  ) => {
    const route = await import('@/app/api/patients/route');
    const headers = professionalId
      ? cookieHeaderFor(
          'profissional',
          `${professionalId}@x.com`,
          CLINIC_A_ID,
          professionalId,
        )
      : adminCookieHeader(CLINIC_A_ID);
    const response = await route.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        { fullName, email, phone: '11999990000' },
        headers,
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  describe('Cenário: GET /api/patients', () => {
    it('Dado profissional com um paciente vinculado e outro alheio na clínica, Quando listar, Então só vê o próprio', async () => {
      await ensureTestClinics();
      const drVinculo = await createProfessional('Dra. Lista Vínculo');
      const meuPaciente = await createPatientAs(
        'Meu Paciente',
        'meu-paciente@x.com',
        drVinculo,
      );
      const outroPaciente = await createPatientAs(
        'Paciente Alheio',
        'paciente-alheio@x.com',
      );

      const route = await import('@/app/api/patients/route');
      const headers = cookieHeaderFor(
        'profissional',
        `${drVinculo}@x.com`,
        CLINIC_A_ID,
        drVinculo,
      );
      const response = await route.GET(
        jsonRequest('/api/patients', 'GET', undefined, headers),
      );
      const body = (await response.json()) as Envelope<{ id: string }[]>;

      const ids = body.data.map((p) => p.id);
      expect(ids).toContain(meuPaciente);
      expect(ids).not.toContain(outroPaciente);
    });

    it('Dado profissional sem nenhum vínculo, Quando listar, Então lista vazia (não a clínica inteira)', async () => {
      await ensureTestClinics();
      const drSemVinculo = await createProfessional('Dr. Lista Sem Vínculo');
      await createPatientAs('Paciente de Outros', 'outros-pacientes@x.com');

      const route = await import('@/app/api/patients/route');
      const headers = cookieHeaderFor(
        'profissional',
        `${drSemVinculo}@x.com`,
        CLINIC_A_ID,
        drSemVinculo,
      );
      const response = await route.GET(
        jsonRequest('/api/patients', 'GET', undefined, headers),
      );
      const body = (await response.json()) as Envelope<{ id: string }[]>;

      expect(body.data).toEqual([]);
    });

    it('Dado company_admin, Quando listar, Então vê todos os pacientes da clínica (sem escopo)', async () => {
      await ensureTestClinics();
      await createPatientAs('Paciente Admin View', 'admin-view@x.com');

      const route = await import('@/app/api/patients/route');
      const response = await route.GET(
        jsonRequest(
          '/api/patients',
          'GET',
          undefined,
          adminCookieHeader(CLINIC_A_ID),
        ),
      );
      const body = (await response.json()) as Envelope<{ id: string }[]>;

      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  describe('Cenário: GET /api/appointments', () => {
    const scheduleAs = async (
      patientId: string,
      professionalId: string,
      actorHeaders: Record<string, string>,
    ) => {
      const route = await import('@/app/api/appointments/route');
      const response = await route.POST(
        jsonRequest(
          '/api/appointments',
          'POST',
          {
            patientId,
            startsAt: '2026-09-10T09:00:00.000Z',
            endsAt: '2026-09-10T10:00:00.000Z',
            procedure: 'Consulta',
            priceCents: 10000,
            professionalId,
          },
          actorHeaders,
        ),
      );
      expect(response.status).toBe(200);
    };

    it('Dado dois profissionais com agendamentos distintos, Quando um lista, Então só vê a própria agenda mesmo pedindo professionalId de outro', async () => {
      await ensureTestClinics();
      const drA = await createProfessional('Dr. A — Agenda Lista');
      const drB = await createProfessional('Dr. B — Agenda Lista');
      const admin = adminCookieHeader(CLINIC_A_ID);
      const patientA = await createPatientAs(
        'Paciente Dr. A',
        'paciente-dr-a@x.com',
      );
      const patientB = await createPatientAs(
        'Paciente Dr. B',
        'paciente-dr-b@x.com',
      );

      await scheduleAs(patientA, drA, admin);
      await scheduleAs(patientB, drB, admin);

      const route = await import('@/app/api/appointments/route');
      const headersA = cookieHeaderFor(
        'profissional',
        `${drA}@x.com`,
        CLINIC_A_ID,
        drA,
      );
      // Dr. A tenta forjar professionalId=drB na query string.
      const response = await route.GET(
        jsonRequest(
          `/api/appointments?from=2026-09-01T00:00:00.000Z&to=2026-09-30T00:00:00.000Z&professionalId=${drB}`,
          'GET',
          undefined,
          headersA,
        ),
      );
      const body = (await response.json()) as Envelope<
        { professionalId: string }[]
      >;

      expect(body.data.every((row) => row.professionalId === drA)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });
  });
});
