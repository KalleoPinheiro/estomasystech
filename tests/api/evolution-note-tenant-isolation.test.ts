import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Isolamento de Nota de Evolução por empresa (MT-19)', () => {
  const createPatient = async (clinicId: string, email: string) => {
    const patientsRoute = await import('@/app/api/patients/route');
    const response = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        { fullName: 'Paciente Teste', email, phone: '11999990000' },
        adminCookieHeader(clinicId),
      ),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  it('Dada sessão da clínica A, Quando GET evoluções de paciente da clínica B, Então lista vazia (isolada pelo escopo do paciente)', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'evo-b@x.com');

    const route = await import('@/app/api/patients/[id]/evolutions/route');
    await route.POST(
      jsonRequest(
        `/api/patients/${patientB}/evolutions`,
        'POST',
        { subjective: 'Relato da clínica B' },
        adminCookieHeader(CLINIC_B_ID),
      ),
      { params: Promise.resolve({ id: patientB }) },
    );

    const response = await route.GET(
      jsonRequest(
        `/api/patients/${patientB}/evolutions`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: patientB }) },
    );
    const body = (await response.json()) as Envelope<unknown[]>;

    expect(body.data).toHaveLength(0);
  });

  it('Dada sessão da própria clínica, Quando GET evoluções, Então lista inclui a nota criada', async () => {
    await ensureTestClinics();
    const patientB = await createPatient(CLINIC_B_ID, 'evo-b2@x.com');

    const route = await import('@/app/api/patients/[id]/evolutions/route');
    await route.POST(
      jsonRequest(
        `/api/patients/${patientB}/evolutions`,
        'POST',
        { subjective: 'Relato próprio' },
        adminCookieHeader(CLINIC_B_ID),
      ),
      { params: Promise.resolve({ id: patientB }) },
    );

    const response = await route.GET(
      jsonRequest(
        `/api/patients/${patientB}/evolutions`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
      { params: Promise.resolve({ id: patientB }) },
    );
    const body = (await response.json()) as Envelope<
      Array<{ subjective: string }>
    >;

    expect(body.data.some((n) => n.subjective === 'Relato próprio')).toBe(true);
  });

  it('Dada evolução salva com texto conhecido, Quando consultada por SQL direto (bypass do repositório), Então a coluna não contém o texto plano; Quando lida via ListEvolutionNotes, Então retorna o texto plano de volta', async () => {
    await ensureTestClinics();
    const patient = await createPatient(CLINIC_A_ID, 'evo-cifra@x.com');
    const plainText =
      'Paciente relatou dor lombar nível 7/10 — nota de evolução sensível';

    const route = await import('@/app/api/patients/[id]/evolutions/route');
    await route.POST(
      jsonRequest(
        `/api/patients/${patient}/evolutions`,
        'POST',
        { subjective: plainText },
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: patient }) },
    );

    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    const { evolutionNotes } = await import(
      '@/infrastructure/persistence/drizzle/schema'
    );
    const db = await getDb();
    const rows = await db
      .select()
      .from(evolutionNotes)
      .where(eq(evolutionNotes.patientId, patient));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjective).not.toContain(plainText);
    expect(rows[0]?.subjective).not.toBe('');

    const response = await route.GET(
      jsonRequest(
        `/api/patients/${patient}/evolutions`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: patient }) },
    );
    const body = (await response.json()) as Envelope<
      Array<{ subjective: string }>
    >;

    expect(body.data.some((n) => n.subjective === plainText)).toBe(true);
  });

  it('Dado AUTH_SECRET ausente, Quando getRepositories tenta construir os repositórios clínicos cifrados, Então lança erro explícito (fail-closed, sem fallback em claro)', async () => {
    const original = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      const { getRepositories } = await import('@/infrastructure/container');
      await expect(getRepositories(clinicScope(CLINIC_A_ID))).rejects.toThrow();
    } finally {
      process.env.AUTH_SECRET = original;
    }
  });

  it('Dado AUTH_SECRET configurado, Quando getRepositories constrói os repositórios clínicos cifrados, Então funcionam normalmente (regressão zero)', async () => {
    const { getRepositories } = await import('@/infrastructure/container');
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));

    expect(repos.evolutions).toBeDefined();
    expect(repos.conditions).toBeDefined();
    expect(repos.assessments).toBeDefined();
  });
});
