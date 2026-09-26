import { beforeAll, describe, expect, it } from 'vitest';
import { ConditionPhoto } from '@/domain/clinical/condition-photo';
import { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import { NursingIntervention } from '@/domain/taxonomy/nursing-intervention';
import { NursingOutcome } from '@/domain/taxonomy/nursing-outcome';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest, multipartRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

/**
 * Escopo R4 (RBAC-17/19) nas rotas clínicas endereçadas pelo id do RECURSO
 * (issue #186). A cadeia recurso→paciente (condição → paciente; foto →
 * condição → paciente; plano → paciente; intervenção/resultado → plano →
 * paciente) precisa terminar na checagem de vínculo, como já acontece em
 * `/api/patients/:id/*`.
 */

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

const admin = () => adminCookieHeader(CLINIC_A_ID);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const readJson = async <T>(response: Response): Promise<Envelope<T>> =>
  (await response.json()) as Envelope<T>;

async function seedCatalog(): Promise<void> {
  const { nursingDiagnoses, nursingOutcomes, nursingInterventions } =
    await getRepositories(systemScope());
  await nursingDiagnoses.save(
    NursingDiagnosis.create({
      code: '00046',
      label: 'Integridade da pele prejudicada',
      domain: 'Domínio 11',
      class: 'Classe 2',
      edition: 'NANDA-I 2021-2023',
    }),
  );
  await nursingOutcomes.save(
    NursingOutcome.create({
      code: '1101',
      label: 'Integridade tissular: pele e mucosas',
      domain: 'Saúde fisiológica',
      class: 'Integridade tissular',
      edition: 'NOC 6ª ed.',
      scaleAnchors: ['1', '2', '3', '4', '5'],
    }),
  );
  await nursingInterventions.save(
    NursingIntervention.create({
      code: '3660',
      label: 'Cuidados com lesões',
      domain: 'Fisiológico: básico',
      class: 'Controle de pele/lesão',
      edition: 'NIC 7ª ed.',
    }),
  );
}

async function createProfessional(fullName: string): Promise<string> {
  const route = await import('@/app/api/professionals/route');
  const response = await route.POST(
    jsonRequest('/api/professionals', 'POST', { fullName }, admin()),
  );
  return (await readJson<{ id: string }>(response)).data.id;
}

async function createPatient(fullName: string): Promise<string> {
  const route = await import('@/app/api/patients/route');
  const response = await route.POST(
    jsonRequest(
      '/api/patients',
      'POST',
      {
        fullName,
        email: `r4-${Math.random()}@x.com`,
        phone: '11999990000',
      },
      admin(),
    ),
  );
  return (await readJson<{ id: string }>(response)).data.id;
}

interface Fixture {
  patientId: string;
  conditionId: string;
  photoId: string;
  patientPhotoId: string;
  carePlanId: string;
  outcomeId: string;
  interventionId: string;
}

/** Recursos clínicos completos de um paciente, todos criados pelo Admin. */
async function seedClinicalResources(patientId: string): Promise<Fixture> {
  const conditionsRoute = await import(
    '@/app/api/patients/[id]/conditions/route'
  );
  const condition = await readJson<{ id: string }>(
    await conditionsRoute.POST(
      jsonRequest(
        `/api/patients/${patientId}/conditions`,
        'POST',
        { kind: 'wound', title: 'Ferida R4', notes: 'nota clínica sigilosa' },
        admin(),
      ),
      ctx(patientId),
    ),
  );
  const conditionId = condition.data.id;

  const photosRoute = await import('@/app/api/conditions/[id]/photos/route');
  const form = new FormData();
  form.set('file', new File([pngBytes], 'foto.png', { type: 'image/png' }));
  const photo = await readJson<{ id: string }>(
    await photosRoute.POST(
      multipartRequest(`/api/conditions/${conditionId}/photos`, form, admin()),
      ctx(conditionId),
    ),
  );

  const { conditionPhotos } = await getRepositories(clinicScope(CLINIC_A_ID));
  const patientPhoto = ConditionPhoto.create({
    conditionId,
    contentType: 'image/png',
    sizeBytes: pngBytes.byteLength,
    origin: 'patient',
    patientNote: 'observação do paciente',
  });
  await conditionPhotos.save(patientPhoto);

  const carePlansRoute = await import(
    '@/app/api/patients/[id]/care-plans/route'
  );
  const plan = await readJson<{ id: string }>(
    await carePlansRoute.POST(
      jsonRequest(`/api/patients/${patientId}/care-plans`, 'POST', {}, admin()),
      ctx(patientId),
    ),
  );
  const carePlanId = plan.data.id;

  const outcomesRoute = await import(
    '@/app/api/care-plans/[id]/outcomes/route'
  );
  const outcome = await readJson<{ id: string }>(
    await outcomesRoute.POST(
      jsonRequest(
        `/api/care-plans/${carePlanId}/outcomes`,
        'POST',
        { outcomeCode: '1101', baselineScore: 2, targetScore: 4 },
        admin(),
      ),
      ctx(carePlanId),
    ),
  );

  const interventionsRoute = await import(
    '@/app/api/care-plans/[id]/interventions/route'
  );
  const intervention = await readJson<{ id: string }>(
    await interventionsRoute.POST(
      jsonRequest(
        `/api/care-plans/${carePlanId}/interventions`,
        'POST',
        { interventionCode: '3660', frequency: 'diária', priority: 'alta' },
        admin(),
      ),
      ctx(carePlanId),
    ),
  );

  return {
    patientId,
    conditionId,
    photoId: photo.data.id,
    patientPhotoId: patientPhoto.id,
    carePlanId,
    outcomeId: outcome.data.id,
    interventionId: intervention.data.id,
  };
}

type Call = (fx: Fixture, headers: Record<string, string>) => Promise<Response>;

interface RouteCase {
  name: string;
  call: Call;
}

const routeCases: RouteCase[] = [
  {
    name: 'GET /api/conditions/[id]',
    call: async (fx, headers) => {
      const route = await import('@/app/api/conditions/[id]/route');
      return route.GET(
        jsonRequest(
          `/api/conditions/${fx.conditionId}`,
          'GET',
          undefined,
          headers,
        ),
        ctx(fx.conditionId),
      );
    },
  },
  {
    name: 'PATCH /api/conditions/[id]',
    call: async (fx, headers) => {
      const route = await import('@/app/api/conditions/[id]/route');
      return route.PATCH(
        jsonRequest(
          `/api/conditions/${fx.conditionId}`,
          'PATCH',
          { action: 'resolve' },
          headers,
        ),
        ctx(fx.conditionId),
      );
    },
  },
  {
    name: 'GET /api/conditions/[id]/assessments',
    call: async (fx, headers) => {
      const route = await import('@/app/api/conditions/[id]/assessments/route');
      return route.GET(
        jsonRequest(
          `/api/conditions/${fx.conditionId}/assessments`,
          'GET',
          undefined,
          headers,
        ),
        ctx(fx.conditionId),
      );
    },
  },
  {
    name: 'POST /api/conditions/[id]/assessments',
    call: async (fx, headers) => {
      const route = await import('@/app/api/conditions/[id]/assessments/route');
      return route.POST(
        jsonRequest(
          `/api/conditions/${fx.conditionId}/assessments`,
          'POST',
          { lengthMm: 10, widthMm: 5, painScale: 3 },
          headers,
        ),
        ctx(fx.conditionId),
      );
    },
  },
  {
    name: 'GET /api/conditions/[id]/photos',
    call: async (fx, headers) => {
      const route = await import('@/app/api/conditions/[id]/photos/route');
      return route.GET(
        jsonRequest(
          `/api/conditions/${fx.conditionId}/photos`,
          'GET',
          undefined,
          headers,
        ),
        ctx(fx.conditionId),
      );
    },
  },
  {
    name: 'POST /api/conditions/[id]/photos',
    call: async (fx, headers) => {
      const route = await import('@/app/api/conditions/[id]/photos/route');
      const form = new FormData();
      form.set('file', new File([pngBytes], 'f.png', { type: 'image/png' }));
      return route.POST(
        multipartRequest(
          `/api/conditions/${fx.conditionId}/photos`,
          form,
          headers,
        ),
        ctx(fx.conditionId),
      );
    },
  },
  {
    name: 'GET /api/photos/[id]',
    call: async (fx, headers) => {
      const route = await import('@/app/api/photos/[id]/route');
      return route.GET(
        jsonRequest(`/api/photos/${fx.photoId}`, 'GET', undefined, headers),
        ctx(fx.photoId),
      );
    },
  },
  {
    name: 'DELETE /api/photos/[id]',
    call: async (fx, headers) => {
      const route = await import('@/app/api/photos/[id]/route');
      return route.DELETE(
        jsonRequest(`/api/photos/${fx.photoId}`, 'DELETE', undefined, headers),
        ctx(fx.photoId),
      );
    },
  },
  {
    name: 'PATCH /api/photos/[id] (triagem)',
    call: async (fx, headers) => {
      const route = await import('@/app/api/photos/[id]/route');
      return route.PATCH(
        jsonRequest(
          `/api/photos/${fx.patientPhotoId}`,
          'PATCH',
          { triage: 'escalated' },
          headers,
        ),
        ctx(fx.patientPhotoId),
      );
    },
  },
  {
    name: 'GET /api/care-plans/[id]',
    call: async (fx, headers) => {
      const route = await import('@/app/api/care-plans/[id]/route');
      return route.GET(
        jsonRequest(
          `/api/care-plans/${fx.carePlanId}`,
          'GET',
          undefined,
          headers,
        ),
        ctx(fx.carePlanId),
      );
    },
  },
  {
    name: 'PATCH /api/care-plans/[id]',
    call: async (fx, headers) => {
      const route = await import('@/app/api/care-plans/[id]/route');
      return route.PATCH(
        jsonRequest(
          `/api/care-plans/${fx.carePlanId}`,
          'PATCH',
          { action: 'resolve' },
          headers,
        ),
        ctx(fx.carePlanId),
      );
    },
  },
  {
    name: 'POST /api/care-plans/[id]/diagnoses',
    call: async (fx, headers) => {
      const route = await import('@/app/api/care-plans/[id]/diagnoses/route');
      return route.POST(
        jsonRequest(
          `/api/care-plans/${fx.carePlanId}/diagnoses`,
          'POST',
          {
            diagnosisCode: '00046',
            type: 'real',
            relatedFactors: 'Pressão prolongada',
            definingCharacteristics: 'Lesão em região sacral',
          },
          headers,
        ),
        ctx(fx.carePlanId),
      );
    },
  },
  {
    name: 'POST /api/care-plans/[id]/outcomes',
    call: async (fx, headers) => {
      const route = await import('@/app/api/care-plans/[id]/outcomes/route');
      return route.POST(
        jsonRequest(
          `/api/care-plans/${fx.carePlanId}/outcomes`,
          'POST',
          { outcomeCode: '1101', baselineScore: 1, targetScore: 3 },
          headers,
        ),
        ctx(fx.carePlanId),
      );
    },
  },
  {
    name: 'POST /api/care-plans/[id]/interventions',
    call: async (fx, headers) => {
      const route = await import(
        '@/app/api/care-plans/[id]/interventions/route'
      );
      return route.POST(
        jsonRequest(
          `/api/care-plans/${fx.carePlanId}/interventions`,
          'POST',
          { interventionCode: '3660', frequency: 'semanal', priority: 'baixa' },
          headers,
        ),
        ctx(fx.carePlanId),
      );
    },
  },
  {
    name: 'POST /api/care-plan-interventions/[id]/records',
    call: async (fx, headers) => {
      const route = await import(
        '@/app/api/care-plan-interventions/[id]/records/route'
      );
      return route.POST(
        jsonRequest(
          `/api/care-plan-interventions/${fx.interventionId}/records`,
          'POST',
          { notes: 'Troca realizada' },
          headers,
        ),
        ctx(fx.interventionId),
      );
    },
  },
  {
    name: 'POST /api/care-plan-outcomes/[id]/evaluations',
    call: async (fx, headers) => {
      const route = await import(
        '@/app/api/care-plan-outcomes/[id]/evaluations/route'
      );
      return route.POST(
        jsonRequest(
          `/api/care-plan-outcomes/${fx.outcomeId}/evaluations`,
          'POST',
          { score: 3 },
          headers,
        ),
        ctx(fx.outcomeId),
      );
    },
  },
];

describe('Feature: Escopo R4 nas rotas clínicas por id de recurso (#186)', () => {
  let professionalId: string;
  let professionalHeaders: Record<string, string>;
  let linkedPatientId: string;
  let unlinkedPatientId: string;

  beforeAll(async () => {
    await ensureTestClinics();
    await seedCatalog();
    professionalId = await createProfessional('Dra. Escopo R4');
    professionalHeaders = cookieHeaderFor(
      'profissional',
      'dra-r4@x.com',
      CLINIC_A_ID,
      professionalId,
    );
    linkedPatientId = await createPatient('Paciente Vinculado R4');
    unlinkedPatientId = await createPatient('Paciente Alheio R4');
    const { professionalPatientLinks } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    await professionalPatientLinks.ensureLink(professionalId, linkedPatientId);
  });

  describe.each(routeCases)('Cenário: $name', ({ call }) => {
    it('Dado profissional SEM vínculo com o paciente do recurso, Quando chamar, Então 404', async () => {
      const fx = await seedClinicalResources(unlinkedPatientId);

      const response = await call(fx, professionalHeaders);

      expect(response.status).toBe(404);
    });

    it('Dado profissional COM vínculo com o paciente do recurso, Quando chamar, Então 200', async () => {
      const fx = await seedClinicalResources(linkedPatientId);

      const response = await call(fx, professionalHeaders);

      expect(response.status).toBe(200);
    });

    it('Dado company_admin sem vínculo nenhum, Quando chamar, Então 200 (R4 é só do Profissional)', async () => {
      const fx = await seedClinicalResources(unlinkedPatientId);

      const response = await call(fx, admin());

      expect(response.status).toBe(200);
    });
  });

  describe('Cenário: a negativa não vaza o dado nem executa a escrita', () => {
    it('Dado profissional sem vínculo, Quando GET condição, Então corpo sem notes nem patientId', async () => {
      const fx = await seedClinicalResources(unlinkedPatientId);
      const route = await import('@/app/api/conditions/[id]/route');

      const response = await route.GET(
        jsonRequest(
          `/api/conditions/${fx.conditionId}`,
          'GET',
          undefined,
          professionalHeaders,
        ),
        ctx(fx.conditionId),
      );
      const text = await response.text();

      expect(response.status).toBe(404);
      expect(text).not.toContain('nota clínica sigilosa');
      expect(text).not.toContain(unlinkedPatientId);
    });

    it('Dado profissional sem vínculo, Quando DELETE foto, Então a foto continua existindo', async () => {
      const fx = await seedClinicalResources(unlinkedPatientId);
      const route = await import('@/app/api/photos/[id]/route');

      await route.DELETE(
        jsonRequest(
          `/api/photos/${fx.photoId}`,
          'DELETE',
          undefined,
          professionalHeaders,
        ),
        ctx(fx.photoId),
      );

      const { conditionPhotos } = await getRepositories(
        clinicScope(CLINIC_A_ID),
      );
      expect(await conditionPhotos.findById(fx.photoId)).not.toBeNull();
    });

    it('Dado profissional sem vínculo, Quando PATCH triagem, Então a foto segue pendente', async () => {
      const fx = await seedClinicalResources(unlinkedPatientId);
      const route = await import('@/app/api/photos/[id]/route');

      await route.PATCH(
        jsonRequest(
          `/api/photos/${fx.patientPhotoId}`,
          'PATCH',
          { triage: 'reviewed' },
          professionalHeaders,
        ),
        ctx(fx.patientPhotoId),
      );

      const { conditionPhotos } = await getRepositories(
        clinicScope(CLINIC_A_ID),
      );
      const photo = await conditionPhotos.findById(fx.patientPhotoId);
      expect(photo?.triageStatus).toBe('pending');
    });

    it('Dado profissional sem vínculo, Quando corpo inválido, Então 404 (não 400 — não distingue recurso existente)', async () => {
      const fx = await seedClinicalResources(unlinkedPatientId);
      const route = await import('@/app/api/care-plans/[id]/outcomes/route');

      const response = await route.POST(
        jsonRequest(
          `/api/care-plans/${fx.carePlanId}/outcomes`,
          'POST',
          {},
          professionalHeaders,
        ),
        ctx(fx.carePlanId),
      );

      expect(response.status).toBe(404);
    });

    it('Dado profissional, Quando recurso inexistente, Então 404', async () => {
      const route = await import('@/app/api/care-plans/[id]/route');

      const response = await route.GET(
        jsonRequest(
          '/api/care-plans/nao-existe',
          'GET',
          undefined,
          professionalHeaders,
        ),
        ctx('nao-existe'),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Cenário: listagens filtradas por vínculo', () => {
    it('Dado fotos pendentes de dois pacientes, Quando profissional GET /api/photos/triage, Então só vê a do vinculado', async () => {
      const mine = await seedClinicalResources(linkedPatientId);
      const other = await seedClinicalResources(unlinkedPatientId);
      const route = await import('@/app/api/photos/triage/route');

      const asProfessional = await readJson<
        Array<{ id: string; patientId: string }>
      >(
        await route.GET(
          jsonRequest(
            '/api/photos/triage',
            'GET',
            undefined,
            professionalHeaders,
          ),
        ),
      );
      const asAdmin = await readJson<Array<{ id: string }>>(
        await route.GET(
          jsonRequest('/api/photos/triage', 'GET', undefined, admin()),
        ),
      );

      const professionalIds = asProfessional.data.map((p) => p.id);
      expect(professionalIds).toContain(mine.patientPhotoId);
      expect(professionalIds).not.toContain(other.patientPhotoId);
      expect(
        asProfessional.data.every((p) => p.patientId === linkedPatientId),
      ).toBe(true);
      const adminIds = asAdmin.data.map((p) => p.id);
      expect(adminIds).toEqual(
        expect.arrayContaining([mine.patientPhotoId, other.patientPhotoId]),
      );
    });

    it('Dado retornos de dois pacientes, Quando profissional GET /api/follow-ups, Então só vê o do vinculado', async () => {
      const route = await import('@/app/api/follow-ups/route');
      const dueDate = new Date(Date.now() + 86_400_000).toISOString();
      for (const patientId of [linkedPatientId, unlinkedPatientId]) {
        await route.POST(
          jsonRequest(
            '/api/follow-ups',
            'POST',
            { patientId, dueDate, reason: 'Retorno: troca de bolsa' },
            admin(),
          ),
        );
      }

      const asProfessional = await readJson<Array<{ patientId: string }>>(
        await route.GET(
          jsonRequest('/api/follow-ups', 'GET', undefined, professionalHeaders),
        ),
      );
      const asAdmin = await readJson<Array<{ patientId: string }>>(
        await route.GET(
          jsonRequest('/api/follow-ups', 'GET', undefined, admin()),
        ),
      );

      const professionalPatients = asProfessional.data.map((f) => f.patientId);
      expect(professionalPatients).toContain(linkedPatientId);
      expect(professionalPatients).not.toContain(unlinkedPatientId);
      expect(asAdmin.data.map((f) => f.patientId)).toContain(unlinkedPatientId);
    });

    it('Dado entradas de dois pacientes, Quando profissional GET /api/waitlist, Então só vê a do vinculado', async () => {
      const route = await import('@/app/api/waitlist/route');
      for (const patientId of [linkedPatientId, unlinkedPatientId]) {
        const response = await route.POST(
          jsonRequest(
            '/api/waitlist',
            'POST',
            { patientId, fromDate: '2099-01-10', toDate: '2099-01-20' },
            admin(),
          ),
        );
        expect(response.status).toBe(200);
      }

      const asProfessional = await readJson<Array<{ patientId: string }>>(
        await route.GET(
          jsonRequest('/api/waitlist', 'GET', undefined, professionalHeaders),
        ),
      );
      const asProfessionalByDate = await readJson<Array<{ patientId: string }>>(
        await route.GET(
          jsonRequest(
            '/api/waitlist?date=2099-01-15',
            'GET',
            undefined,
            professionalHeaders,
          ),
        ),
      );
      const asAdmin = await readJson<Array<{ patientId: string }>>(
        await route.GET(
          jsonRequest('/api/waitlist', 'GET', undefined, admin()),
        ),
      );

      for (const list of [asProfessional.data, asProfessionalByDate.data]) {
        const ids = list.map((e) => e.patientId);
        expect(ids).toContain(linkedPatientId);
        expect(ids).not.toContain(unlinkedPatientId);
      }
      expect(asAdmin.data.map((e) => e.patientId)).toContain(unlinkedPatientId);
    });

    it('Dado profissional sem professionalId na sessão, Quando GET /api/follow-ups, Então lista vazia', async () => {
      const route = await import('@/app/api/follow-ups/route');
      const headers = cookieHeaderFor(
        'profissional',
        'sem-id@x.com',
        CLINIC_A_ID,
        null,
      );

      const body = await readJson<unknown[]>(
        await route.GET(
          jsonRequest('/api/follow-ups', 'GET', undefined, headers),
        ),
      );

      expect(body.data).toEqual([]);
    });
  });
});
