import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { jsonRequest, multipartRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);

const NOT_IMAGE_BYTES = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);

const photoUploadRequest = (conditionId: string, formData: FormData) =>
  multipartRequest(`/api/conditions/${conditionId}/photos`, formData);

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Rotas clínicas (condições, avaliações, fotos, anamnese, evolução)', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let anamnesisRoute: typeof import('@/app/api/patients/[id]/anamnesis/route');
  let patientConditionsRoute: typeof import('@/app/api/patients/[id]/conditions/route');
  let evolutionsRoute: typeof import('@/app/api/patients/[id]/evolutions/route');
  let conditionByIdRoute: typeof import('@/app/api/conditions/[id]/route');
  let assessmentsRoute: typeof import('@/app/api/conditions/[id]/assessments/route');
  let photosRoute: typeof import('@/app/api/conditions/[id]/photos/route');

  let patientId: string;
  let conditionAId: string;
  let conditionBId: string;

  beforeAll(async () => {
    patientsRoute = await import('@/app/api/patients/route');
    anamnesisRoute = await import('@/app/api/patients/[id]/anamnesis/route');
    patientConditionsRoute = await import(
      '@/app/api/patients/[id]/conditions/route'
    );
    evolutionsRoute = await import('@/app/api/patients/[id]/evolutions/route');
    conditionByIdRoute = await import('@/app/api/conditions/[id]/route');
    assessmentsRoute = await import(
      '@/app/api/conditions/[id]/assessments/route'
    );
    photosRoute = await import('@/app/api/conditions/[id]/photos/route');
  });

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  it('Dado dados válidos, Quando POST /api/patients, Então cria paciente para os testes clínicos', async () => {
    const response = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'João Pereira',
        email: 'joao.pereira@example.com',
        phone: '11977776666',
      }),
    );
    const body = (await response.json()) as Envelope<{ id: string }>;

    expect(response.status).toBe(200);
    patientId = body.data.id;
  });

  describe('Anamnese', () => {
    it('Dado paciente sem anamnese, Quando GET /api/patients/:id/anamnesis, Então retorna data null', async () => {
      const response = await anamnesisRoute.GET(
        jsonRequest(`/api/patients/${patientId}/anamnesis`, 'GET'),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(200);
      expect(body.data).toBeNull();
    });

    it('Dado dados válidos, Quando PUT /api/patients/:id/anamnesis, Então cria anamnese', async () => {
      const response = await anamnesisRoute.PUT(
        jsonRequest(`/api/patients/${patientId}/anamnesis`, 'PUT', {
          comorbidities: 'Diabetes tipo 2',
          allergies: 'Nenhuma conhecida',
          medications: 'Metformina',
          surgicalHistory: 'Apendicectomia (2010)',
          notes: 'Paciente colaborativo',
        }),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<{
        patientId: string;
        comorbidities: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.patientId).toBe(patientId);
      expect(body.data.comorbidities).toBe('Diabetes tipo 2');
    });

    it('Dado anamnese existente, Quando PUT novamente, Então atualiza (upsert)', async () => {
      const response = await anamnesisRoute.PUT(
        jsonRequest(`/api/patients/${patientId}/anamnesis`, 'PUT', {
          comorbidities: 'Diabetes tipo 2 controlada',
        }),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<{
        comorbidities: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.comorbidities).toBe('Diabetes tipo 2 controlada');

      const getResponse = await anamnesisRoute.GET(
        jsonRequest(`/api/patients/${patientId}/anamnesis`, 'GET'),
        context(patientId),
      );
      const getBody = (await getResponse.json()) as Envelope<{
        comorbidities: string;
      }>;

      expect(getBody.data.comorbidities).toBe('Diabetes tipo 2 controlada');
    });

    it('Dado paciente inexistente, Quando PUT /api/patients/:id/anamnesis, Então retorna 404', async () => {
      const response = await anamnesisRoute.PUT(
        jsonRequest('/api/patients/ghost/anamnesis', 'PUT', {
          comorbidities: 'x',
        }),
        context('ghost'),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Condições clínicas', () => {
    it('Dado dados válidos, Quando POST /api/patients/:id/conditions, Então cria condição de ferida', async () => {
      const response = await patientConditionsRoute.POST(
        jsonRequest(`/api/patients/${patientId}/conditions`, 'POST', {
          kind: 'wound',
          title: 'Ferida sacral',
          notes: 'Estágio 2',
        }),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<{
        id: string;
        patientId: string;
        kind: string;
        status: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.kind).toBe('wound');
      expect(body.data.status).toBe('active');
      conditionAId = body.data.id;
    });

    it('Dado dados válidos, Quando POST /api/patients/:id/conditions, Então cria condição de estomia', async () => {
      const response = await patientConditionsRoute.POST(
        jsonRequest(`/api/patients/${patientId}/conditions`, 'POST', {
          kind: 'stoma',
          title: 'Colostomia definitiva',
          stomaType: 'colostomia',
        }),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<{
        id: string;
        stomaType: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.stomaType).toBe('colostomia');
      conditionBId = body.data.id;
    });

    it('Dado kind inválido, Quando POST /api/patients/:id/conditions, Então retorna 400', async () => {
      const response = await patientConditionsRoute.POST(
        jsonRequest(`/api/patients/${patientId}/conditions`, 'POST', {
          kind: 'invalid-kind',
          title: 'Condição inválida',
        }),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toContain('Dados inválidos');
    });

    it('Dado paciente inexistente, Quando POST /api/patients/:id/conditions, Então retorna 404', async () => {
      const response = await patientConditionsRoute.POST(
        jsonRequest('/api/patients/ghost/conditions', 'POST', {
          kind: 'wound',
          title: 'Ferida',
        }),
        context('ghost'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado paciente com condições, Quando GET /api/patients/:id/conditions, Então lista ambas', async () => {
      const response = await patientConditionsRoute.GET(
        jsonRequest(`/api/patients/${patientId}/conditions`, 'GET'),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<Array<{ id: string }>>;

      expect(body.data).toHaveLength(2);
    });

    it('Dado condição existente, Quando GET /api/conditions/:id, Então retorna a condição', async () => {
      const response = await conditionByIdRoute.GET(
        jsonRequest(`/api/conditions/${conditionAId}`, 'GET'),
        context(conditionAId),
      );
      const body = (await response.json()) as Envelope<{
        id: string;
        title: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.id).toBe(conditionAId);
      expect(body.data.title).toBe('Ferida sacral');
    });

    it('Dado condição inexistente, Quando GET /api/conditions/:id, Então retorna 200 com data null', async () => {
      const response = await conditionByIdRoute.GET(
        jsonRequest('/api/conditions/ghost', 'GET'),
        context('ghost'),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(200);
      expect(body.data).toBeNull();
    });

    it('Dado action inválida, Quando PATCH /api/conditions/:id, Então retorna 400', async () => {
      const response = await conditionByIdRoute.PATCH(
        jsonRequest(`/api/conditions/${conditionAId}`, 'PATCH', {
          action: 'close',
        }),
        context(conditionAId),
      );

      expect(response.status).toBe(400);
    });

    it('Dado condição inexistente, Quando PATCH resolve, Então retorna 404', async () => {
      const response = await conditionByIdRoute.PATCH(
        jsonRequest('/api/conditions/ghost', 'PATCH', { action: 'resolve' }),
        context('ghost'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado condição ativa, Quando PATCH resolve, Então resolve a condição', async () => {
      const response = await conditionByIdRoute.PATCH(
        jsonRequest(`/api/conditions/${conditionAId}`, 'PATCH', {
          action: 'resolve',
        }),
        context(conditionAId),
      );
      const body = (await response.json()) as Envelope<{ status: string }>;

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('resolved');
    });

    it('Dado condição já resolvida, Quando PATCH resolve novamente, Então retorna 409', async () => {
      const response = await conditionByIdRoute.PATCH(
        jsonRequest(`/api/conditions/${conditionAId}`, 'PATCH', {
          action: 'resolve',
        }),
        context(conditionAId),
      );

      expect(response.status).toBe(409);
    });
  });

  describe('Avaliações de condição', () => {
    it('Dado dados válidos, Quando POST /api/conditions/:id/assessments, Então cria avaliação', async () => {
      const response = await assessmentsRoute.POST(
        jsonRequest(`/api/conditions/${conditionBId}/assessments`, 'POST', {
          lengthMm: 20,
          widthMm: 10,
          depthMm: 5,
          exudate: 'moderate',
          painScale: 4,
          notes: 'Evolução favorável',
        }),
        context(conditionBId),
      );
      const body = (await response.json()) as Envelope<{
        id: string;
        conditionId: string;
        exudate: string;
        painScale: number;
        areaMm2: number | null;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.conditionId).toBe(conditionBId);
      expect(body.data.exudate).toBe('moderate');
      expect(body.data.painScale).toBe(4);
      expect(body.data.areaMm2).toBe(200);
    });

    it('Dado painScale fora do intervalo, Quando POST assessments, Então retorna 400', async () => {
      const response = await assessmentsRoute.POST(
        jsonRequest(`/api/conditions/${conditionBId}/assessments`, 'POST', {
          painScale: 99,
        }),
        context(conditionBId),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toContain('Dados inválidos');
    });

    it('Dado condição inexistente, Quando POST assessments, Então retorna 404', async () => {
      const response = await assessmentsRoute.POST(
        jsonRequest('/api/conditions/ghost/assessments', 'POST', {
          painScale: 3,
        }),
        context('ghost'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado condição inexistente, Quando GET /api/conditions/:id/assessments, Então lista vazia sem erro', async () => {
      const response = await assessmentsRoute.GET(
        jsonRequest('/api/conditions/ghost/assessments', 'GET'),
        context('ghost'),
      );
      const body = (await response.json()) as Envelope<Array<unknown>>;

      expect(response.status).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('Dado condição com avaliação, Quando GET /api/conditions/:id/assessments, Então retorna a lista', async () => {
      const response = await assessmentsRoute.GET(
        jsonRequest(`/api/conditions/${conditionBId}/assessments`, 'GET'),
        context(conditionBId),
      );
      const body = (await response.json()) as Envelope<
        Array<{ conditionId: string }>
      >;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].conditionId).toBe(conditionBId);
    });

    it('Dada avaliação salva com notes preenchido, Quando consultada por SQL direto (bypass do repositório), Então a coluna não contém o texto plano; Quando lida via GET, Então retorna o texto plano de volta', async () => {
      const plainText =
        'Avaliação com secreção purulenta — nota clínica sensível';
      const createResponse = await assessmentsRoute.POST(
        jsonRequest(`/api/conditions/${conditionBId}/assessments`, 'POST', {
          painScale: 3,
          notes: plainText,
        }),
        context(conditionBId),
      );
      const createBody = (await createResponse.json()) as Envelope<{
        id: string;
      }>;
      const assessmentId = createBody.data.id;

      const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
      const { conditionAssessments } = await import(
        '@/infrastructure/persistence/drizzle/schema'
      );
      const db = await getDb();
      const rows = await db
        .select()
        .from(conditionAssessments)
        .where(eq(conditionAssessments.id, assessmentId));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.notes).not.toContain(plainText);
      expect(rows[0]?.notes).not.toBeNull();

      const getResponse = await assessmentsRoute.GET(
        jsonRequest(`/api/conditions/${conditionBId}/assessments`, 'GET'),
        context(conditionBId),
      );
      const getBody = (await getResponse.json()) as Envelope<
        Array<{ id: string; notes: string | null }>
      >;

      expect(getBody.data.find((a) => a.id === assessmentId)?.notes).toBe(
        plainText,
      );
    });

    it('Dada avaliação salva sem notes (null), Quando persistida e lida, Então permanece null sem tentar cifrar', async () => {
      const createResponse = await assessmentsRoute.POST(
        jsonRequest(`/api/conditions/${conditionBId}/assessments`, 'POST', {
          painScale: 2,
        }),
        context(conditionBId),
      );
      const createBody = (await createResponse.json()) as Envelope<{
        id: string;
        notes: string | null;
      }>;

      expect(createBody.data.notes).toBeNull();

      const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
      const { conditionAssessments } = await import(
        '@/infrastructure/persistence/drizzle/schema'
      );
      const db = await getDb();
      const rows = await db
        .select()
        .from(conditionAssessments)
        .where(eq(conditionAssessments.id, createBody.data.id));

      expect(rows[0]?.notes).toBeNull();

      const getResponse = await assessmentsRoute.GET(
        jsonRequest(`/api/conditions/${conditionBId}/assessments`, 'GET'),
        context(conditionBId),
      );
      const getBody = (await getResponse.json()) as Envelope<
        Array<{ id: string; notes: string | null }>
      >;

      expect(
        getBody.data.find((a) => a.id === createBody.data.id)?.notes,
      ).toBeNull();
    });
  });

  describe('Fotos de condição', () => {
    it('Dado arquivo que não é imagem, Quando POST /api/conditions/:id/photos, Então retorna 400', async () => {
      const formData = new FormData();
      formData.set(
        'file',
        new File([NOT_IMAGE_BYTES], 'arquivo.txt', { type: 'text/plain' }),
      );

      const response = await photosRoute.POST(
        photoUploadRequest(conditionBId, formData),
        context(conditionBId),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toContain('Arquivo não é uma imagem');
    });

    it('Dado campo file ausente, Quando POST /api/conditions/:id/photos, Então retorna 400 direto', async () => {
      const formData = new FormData();

      const response = await photosRoute.POST(
        photoUploadRequest(conditionBId, formData),
        context(conditionBId),
      );

      expect(response.status).toBe(400);
    });

    it('Dado condição inexistente, Quando POST /api/conditions/:id/photos com imagem válida, Então retorna 404', async () => {
      const formData = new FormData();
      formData.set(
        'file',
        new File([PNG_BYTES], 'ferida.png', { type: 'image/png' }),
      );

      const response = await photosRoute.POST(
        photoUploadRequest('ghost', formData),
        context('ghost'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado imagem PNG válida, Quando POST /api/conditions/:id/photos, Então salva a foto', async () => {
      const formData = new FormData();
      formData.set(
        'file',
        new File([PNG_BYTES], 'ferida.png', { type: 'image/png' }),
      );

      const response = await photosRoute.POST(
        photoUploadRequest(conditionBId, formData),
        context(conditionBId),
      );
      const body = (await response.json()) as Envelope<{
        conditionId: string;
        contentType: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.conditionId).toBe(conditionBId);
      expect(body.data.contentType).toBe('image/png');
    });

    it('Dado condição com foto, Quando GET /api/conditions/:id/photos, Então lista a foto', async () => {
      const response = await photosRoute.GET(
        jsonRequest(`/api/conditions/${conditionBId}/photos`, 'GET'),
        context(conditionBId),
      );
      const body = (await response.json()) as Envelope<
        Array<{ conditionId: string }>
      >;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].conditionId).toBe(conditionBId);
    });

    it('Dado condição B ativa, Quando PATCH resolve, Então resolve a condição B', async () => {
      const response = await conditionByIdRoute.PATCH(
        jsonRequest(`/api/conditions/${conditionBId}`, 'PATCH', {
          action: 'resolve',
        }),
        context(conditionBId),
      );
      const body = (await response.json()) as Envelope<{ status: string }>;

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('resolved');
    });

    it('Dado condição resolvida, Quando POST assessments, Então retorna 400 de regra de negócio', async () => {
      const response = await assessmentsRoute.POST(
        jsonRequest(`/api/conditions/${conditionBId}/assessments`, 'POST', {
          painScale: 2,
        }),
        context(conditionBId),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toContain('já resolvida');
    });
  });

  describe('Notas de evolução', () => {
    it('Dado paciente sem evoluções, Quando GET /api/patients/:id/evolutions, Então retorna lista vazia', async () => {
      const response = await evolutionsRoute.GET(
        jsonRequest(`/api/patients/${patientId}/evolutions`, 'GET'),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<Array<unknown>>;

      expect(response.status).toBe(200);
      expect(body.data).toEqual([]);
    });

    it('Dado dados válidos, Quando POST /api/patients/:id/evolutions, Então cria nota de evolução', async () => {
      const response = await evolutionsRoute.POST(
        jsonRequest(`/api/patients/${patientId}/evolutions`, 'POST', {
          subjective: 'Paciente relata melhora da dor',
          objective: 'Ferida com bordas limpas',
          assessment: 'Evolução favorável',
          plan: 'Manter curativo atual',
        }),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<{
        id: string;
        patientId: string;
        subjective: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.patientId).toBe(patientId);
      expect(body.data.subjective).toBe('Paciente relata melhora da dor');
    });

    it('Dado só um campo SOAP preenchido, Quando POST /api/patients/:id/evolutions, Então usa defaults vazios nos demais', async () => {
      const response = await evolutionsRoute.POST(
        jsonRequest(`/api/patients/${patientId}/evolutions`, 'POST', {
          subjective: 'Nota rápida',
        }),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<{
        subjective: string;
        objective: string;
        assessment: string;
        plan: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.subjective).toBe('Nota rápida');
      expect(body.data.objective).toBe('');
      expect(body.data.plan).toBe('');
    });

    it('Dado todos os campos SOAP vazios, Quando POST /api/patients/:id/evolutions, Então retorna 400 de regra de negócio', async () => {
      const response = await evolutionsRoute.POST(
        jsonRequest(`/api/patients/${patientId}/evolutions`, 'POST', {}),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(400);
      expect(body.error).toContain('ao menos um campo SOAP');
    });

    it('Dado paciente inexistente, Quando POST /api/patients/:id/evolutions, Então retorna 404', async () => {
      const response = await evolutionsRoute.POST(
        jsonRequest('/api/patients/ghost/evolutions', 'POST', {
          subjective: 'x',
        }),
        context('ghost'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado company_admin, Quando POST com professionalId forjado no corpo, Então autoria ignora o corpo (#64)', async () => {
      const forgedPatientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Autoria Forjada Admin',
          email: 'autoria-forjada-admin@example.com',
          phone: '11966665555',
        }),
      );
      const forgedPatientId = (
        (await forgedPatientResponse.json()) as Envelope<{ id: string }>
      ).data.id;

      const response = await evolutionsRoute.POST(
        jsonRequest(`/api/patients/${forgedPatientId}/evolutions`, 'POST', {
          subjective: 'Nota com autoria forjada por admin',
          professionalId: 'prof-outro-forjado-2',
        }),
        context(forgedPatientId),
      );
      const body = (await response.json()) as Envelope<{
        professionalId: string | null;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.professionalId).not.toBe('prof-outro-forjado-2');
    });

    it('Dado profissional, Quando POST com professionalId de outro profissional no corpo, Então autoria continua sendo a da sessão (#64)', async () => {
      const professionalsRoute = await import('@/app/api/professionals/route');
      const professionalResponse = await professionalsRoute.POST(
        jsonRequest('/api/professionals', 'POST', {
          fullName: 'Enf. Autoria Legítima',
        }),
      );
      const professionalId = (
        (await professionalResponse.json()) as Envelope<{ id: string }>
      ).data.id;

      const forgedPatientResponse = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Autoria Forjada Profissional',
          email: 'autoria-forjada-prof@example.com',
          phone: '11955554444',
        }),
      );
      const forgedPatientId = (
        (await forgedPatientResponse.json()) as Envelope<{ id: string }>
      ).data.id;

      const { professionalPatientLinks } = await getRepositories(
        clinicScope(LEGACY_CLINIC_ID),
      );
      await professionalPatientLinks.ensureLink(
        professionalId,
        forgedPatientId,
      );

      const response = await evolutionsRoute.POST(
        jsonRequest(
          `/api/patients/${forgedPatientId}/evolutions`,
          'POST',
          {
            subjective: 'Nota assinada',
            professionalId: 'prof-outro-forjado-3',
          },
          cookieHeaderFor('profissional', undefined, undefined, professionalId),
        ),
        context(forgedPatientId),
      );
      const body = (await response.json()) as Envelope<{
        professionalId: string | null;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.professionalId).toBe(professionalId);
    });

    it('Dado paciente com notas, Quando GET /api/patients/:id/evolutions, Então lista as notas criadas', async () => {
      const response = await evolutionsRoute.GET(
        jsonRequest(`/api/patients/${patientId}/evolutions`, 'GET'),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<
        Array<{ patientId: string }>
      >;

      expect(body.data).toHaveLength(2);
      expect(body.data[0].patientId).toBe(patientId);
    });
  });
});
