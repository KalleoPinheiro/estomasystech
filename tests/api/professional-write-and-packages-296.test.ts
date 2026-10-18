import { beforeAll, describe, expect, it } from 'vitest';
import { SessionPackage } from '@/domain/billing/package';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { toPackageBalanceDto } from '@/lib/dto';
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
 * AD-026/AD-027 (#296): o Profissional não cria retorno nem entrada na lista
 * de espera para paciente sem vínculo (403) e vê o saldo de pacotes dos
 * vinculados sem nenhum valor monetário.
 */

const admin = () => adminCookieHeader(CLINIC_A_ID);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const MONEY_KEY = /price|cents|valor|amount|cost/i;

async function post<T>(path: string, body: unknown): Promise<T> {
  const route = await import('@/app/api/patients/route');
  const response = await route.POST(jsonRequest(path, 'POST', body, admin()));
  return ((await response.json()) as Envelope<T>).data;
}

describe('Feature: Profissional — escrita sem vínculo e pacotes sem preço (#296)', () => {
  let professionalHeaders: Record<string, string>;
  let linkedPatientId: string;
  let unlinkedPatientId: string;
  let procedureId: string;

  beforeAll(async () => {
    await ensureTestClinics();
    const professionals = await import('@/app/api/professionals/route');
    const professional = (await (
      await professionals.POST(
        jsonRequest(
          '/api/professionals',
          'POST',
          { fullName: 'Dra. Vínculo 296' },
          admin(),
        ),
      )
    ).json()) as Envelope<{ id: string }>;
    professionalHeaders = cookieHeaderFor(
      'profissional',
      'dra-296@x.com',
      CLINIC_A_ID,
      professional.data.id,
    );
    const mk = async (fullName: string) =>
      (
        await post<{ id: string }>('/api/patients', {
          fullName,
          email: `p296-${Math.random()}@x.com`,
          phone: '11999990000',
        })
      ).id;
    linkedPatientId = await mk('Paciente Vinculado 296');
    unlinkedPatientId = await mk('Paciente Alheio 296');
    const procedures = await import('@/app/api/procedures/route');
    const proc = (await (
      await procedures.POST(
        jsonRequest(
          '/api/procedures',
          'POST',
          { name: 'Curativo 296', priceCents: 15000, durationMinutes: 30 },
          admin(),
        ),
      )
    ).json()) as Envelope<{ id: string }>;
    procedureId = proc.data.id;

    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    await repos.professionalPatientLinks.ensureLink(
      professional.data.id,
      linkedPatientId,
    );
    for (const patientId of [linkedPatientId, unlinkedPatientId]) {
      await repos.sessionPackages.save(
        SessionPackage.create({
          patientId,
          procedureId,
          totalSessions: 10,
          priceCents: 123456,
        }),
      );
    }
  });

  const followUp = (patientId: string, headers: Record<string, string>) =>
    import('@/app/api/follow-ups/route').then((route) =>
      route.POST(
        jsonRequest(
          '/api/follow-ups',
          'POST',
          {
            patientId,
            dueDate: new Date(Date.now() + 86_400_000).toISOString(),
            reason: 'Reavaliar',
          },
          headers,
        ),
      ),
    );

  const waitlist = (patientId: string, headers: Record<string, string>) =>
    import('@/app/api/waitlist/route').then((route) =>
      route.POST(
        jsonRequest(
          '/api/waitlist',
          'POST',
          { patientId, fromDate: '2030-01-10', toDate: '2030-01-20' },
          headers,
        ),
      ),
    );

  describe('Cenário: POST /api/follow-ups', () => {
    it('Dado paciente sem vínculo, Então o Profissional recebe 403 e nada é gravado', async () => {
      const response = await followUp(unlinkedPatientId, professionalHeaders);
      expect(response.status).toBe(403);
      const { followUps } = await getRepositories(clinicScope(CLINIC_A_ID));
      expect(
        (await followUps.findAll()).some(
          (f) => f.patientId === unlinkedPatientId,
        ),
      ).toBe(false);
    });

    it('Dado paciente vinculado, Então o Profissional continua criando (200/201)', async () => {
      const response = await followUp(linkedPatientId, professionalHeaders);
      expect(response.status).toBeLessThan(300);
    });

    it('Dado paciente sem vínculo, Então o Admin continua criando', async () => {
      const response = await followUp(unlinkedPatientId, admin());
      expect(response.status).toBeLessThan(300);
    });
  });

  describe('Cenário: POST /api/waitlist', () => {
    it('Dado paciente sem vínculo, Então o Profissional recebe 403', async () => {
      const response = await waitlist(unlinkedPatientId, professionalHeaders);
      expect(response.status).toBe(403);
    });

    it('Dado paciente vinculado, Então o Profissional continua criando', async () => {
      const response = await waitlist(linkedPatientId, professionalHeaders);
      expect(response.status).toBeLessThan(300);
    });

    it('Dado paciente sem vínculo, Então o Admin continua criando', async () => {
      const response = await waitlist(unlinkedPatientId, admin());
      expect(response.status).toBeLessThan(300);
    });
  });

  describe('Cenário: GET /api/patients/[id]/packages', () => {
    const get = async (patientId: string, headers: Record<string, string>) => {
      const route = await import('@/app/api/patients/[id]/packages/route');
      return route.GET(
        jsonRequest(
          `/api/patients/${patientId}/packages`,
          'GET',
          undefined,
          headers,
        ),
        ctx(patientId),
      );
    };

    it('Dado paciente vinculado, Então devolve nome e saldo, sem nenhum valor monetário', async () => {
      const response = await get(linkedPatientId, professionalHeaders);
      expect(response.status).toBe(200);
      const body = (await response.json()) as Envelope<
        Array<Record<string, unknown>>
      >;
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        procedureName: 'Curativo 296',
        totalSessions: 10,
        remainingSessions: 10,
      });
      expect(
        Object.keys(body.data[0]).filter((k) => MONEY_KEY.test(k)),
      ).toEqual([]);
      expect(JSON.stringify(body)).not.toContain('123456');
    });

    it('Dado paciente sem vínculo, Então o Profissional recebe 404', async () => {
      const response = await get(unlinkedPatientId, professionalHeaders);
      expect(response.status).toBe(404);
    });

    it('Dado Atendente, Então a rota é negada (família clínica)', async () => {
      const route = await import('@/app/api/patients/[id]/packages/route');
      const response = await route.GET(
        jsonRequest(
          `/api/patients/${linkedPatientId}/packages`,
          'GET',
          undefined,
          cookieHeaderFor('atendente', 'at@x.com', CLINIC_A_ID),
        ),
        ctx(linkedPatientId),
      );
      expect(response.status).toBe(403);
    });

    it('Dado o Profissional, Então GET /api/packages (com preço) segue negado', async () => {
      const route = await import('@/app/api/packages/route');
      const response = await route.GET(
        jsonRequest(
          `/api/packages?patientId=${linkedPatientId}`,
          'GET',
          undefined,
          professionalHeaders,
        ),
      );
      expect(response.status).toBe(403);
    });
  });

  it('Dado o DTO do Profissional, Então as chaves são exatamente as aprovadas (sem valores)', () => {
    const dto = toPackageBalanceDto(
      SessionPackage.create({
        patientId: 'p',
        procedureId: 'proc',
        totalSessions: 3,
        priceCents: 999,
      }),
      'Nome',
    );
    expect(Object.keys(dto).sort()).toEqual(
      [
        'active',
        'createdAt',
        'expiresAt',
        'id',
        'procedureId',
        'procedureName',
        'remainingSessions',
        'totalSessions',
        'usedSessions',
      ].sort(),
    );
  });
});
