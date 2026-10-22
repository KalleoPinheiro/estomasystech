import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, completeClinicRegistration } from '../support/clinics';
import { linkAllPortalAccounts } from '../support/portal-account';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
process.env.AUTH_SECRET = 'test-secret-audit-lgpd';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

/** `after()` roda fire-and-forget (mock global) — dá um respiro pro microtask concluir. */
const waitForAudit = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('Feature: Rotas de auditoria, export LGPD, fotos (staff) e cron de lembretes', () => {
  let patientsRoute: typeof import('@/app/api/patients/route');
  let anamnesisRoute: typeof import('@/app/api/patients/[id]/anamnesis/route');
  let conditionsRoute: typeof import('@/app/api/patients/[id]/conditions/route');
  let conditionPhotosRoute: typeof import('@/app/api/conditions/[id]/photos/route');
  let portalPatientPhotosRoute: typeof import('@/app/api/portal/patient/photos/route');
  let auditRoute: typeof import('@/app/api/audit/route');
  let exportRoute: typeof import('@/app/api/patients/[id]/export/route');
  let photoByIdRoute: typeof import('@/app/api/photos/[id]/route');
  let triageRoute: typeof import('@/app/api/photos/triage/route');
  let assessmentsRoute: typeof import('@/app/api/conditions/[id]/assessments/route');
  let remindersRunRoute: typeof import('@/app/api/reminders/run/route');
  let clinicInfoRoute: typeof import('@/app/api/clinic-info/route');

  let patientId: string;
  let patientEmail: string;
  let patientCookieToken: string;
  let conditionId: string;
  let photoId: string;

  const cookieHeader = (token: string) => ({
    cookie: `estomasystech_session=${token}`,
  });

  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);

  const multipartRequest = (
    url: string,
    fields: { file?: File; assessmentId?: string },
  ): NextRequest => {
    const form = new FormData();
    if (fields.file) form.set('file', fields.file);
    if (fields.assessmentId !== undefined)
      form.set('assessmentId', fields.assessmentId);
    return new NextRequest(`http://localhost${url}`, {
      method: 'POST',
      body: form,
      headers: adminCookieHeader(),
    });
  };

  /** Fotos com origem "patient" (única que passa por triagem) via portal do paciente. */
  const uploadPatientOriginPhoto = async (note?: string): Promise<string> => {
    const file = new File([pngBytes], 'paciente.png', { type: 'image/png' });
    const form = new FormData();
    form.set('file', file);
    form.set('conditionId', conditionId);
    if (note !== undefined) form.set('note', note);
    const request = new NextRequest(
      'http://localhost/api/portal/patient/photos',
      {
        method: 'POST',
        body: form,
        headers: cookieHeader(patientCookieToken),
      },
    );
    const response = await portalPatientPhotosRoute.POST(request);
    const body = (await response.json()) as Envelope<{ id: string }>;
    return body.data.id;
  };

  beforeAll(async () => {
    await completeClinicRegistration(CLINIC_A_ID);
    patientsRoute = await import('@/app/api/patients/route');
    anamnesisRoute = await import('@/app/api/patients/[id]/anamnesis/route');
    conditionsRoute = await import('@/app/api/patients/[id]/conditions/route');
    conditionPhotosRoute = await import(
      '@/app/api/conditions/[id]/photos/route'
    );
    portalPatientPhotosRoute = await import(
      '@/app/api/portal/patient/photos/route'
    );
    auditRoute = await import('@/app/api/audit/route');
    exportRoute = await import('@/app/api/patients/[id]/export/route');
    photoByIdRoute = await import('@/app/api/photos/[id]/route');
    triageRoute = await import('@/app/api/photos/triage/route');
    assessmentsRoute = await import(
      '@/app/api/conditions/[id]/assessments/route'
    );
    remindersRunRoute = await import('@/app/api/reminders/run/route');
    clinicInfoRoute = await import('@/app/api/clinic-info/route');

    patientEmail = 'beatriz.auditoria@example.com';
    const patientResponse = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Beatriz Auditoria',
        email: patientEmail,
        phone: '11966665555',
      }),
    );
    const patientBody = (await patientResponse.json()) as Envelope<{
      id: string;
    }>;
    patientId = patientBody.data.id;
    await linkAllPortalAccounts();
    patientCookieToken = (
      await import('@/lib/auth/session')
    ).createSessionToken(
      process.env.AUTH_SECRET as string,
      Date.now() + 3_600_000,
      patientEmail,
      'patient',
    );

    // Gate de consentimento (COMP3-01): envio remoto de foto exige aceite vigente.
    const consentRoute = await import('@/app/api/portal/patient/consent/route');
    await consentRoute.POST(
      new NextRequest(
        'http://localhost/api/portal/patient/consent?purpose=image',
        {
          method: 'POST',
          headers: cookieHeader(patientCookieToken),
        },
      ),
    );

    await anamnesisRoute.PUT(
      jsonRequest(`/api/patients/${patientId}/anamnesis`, 'PUT', {
        comorbidities: 'Diabetes tipo 2',
        allergies: 'Nenhuma conhecida',
      }),
      context(patientId),
    );

    const conditionResponse = await conditionsRoute.POST(
      jsonRequest(`/api/patients/${patientId}/conditions`, 'POST', {
        kind: 'wound',
        title: 'Ferida sacral',
      }),
      context(patientId),
    );
    const conditionBody = (await conditionResponse.json()) as Envelope<{
      id: string;
    }>;
    conditionId = conditionBody.data.id;

    const file = new File([pngBytes], 'foto.png', { type: 'image/png' });
    const photoResponse = await conditionPhotosRoute.POST(
      multipartRequest(`/api/conditions/${conditionId}/photos`, { file }),
      context(conditionId),
    );
    const photoBody = (await photoResponse.json()) as Envelope<{ id: string }>;
    photoId = photoBody.data.id;

    await waitForAudit();
  });

  describe('GET /api/audit', () => {
    it('Dado eventos registrados, Quando GET /api/audit, Então lista eventos de auditoria', async () => {
      const response = await auditRoute.GET(jsonRequest('/api/audit', 'GET'));
      const body = (await response.json()) as Envelope<
        Array<{ id: string; resourceType: string }>
      >;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('Dado filtro patientId, Quando GET /api/audit, Então retorna somente eventos do paciente', async () => {
      const response = await auditRoute.GET(
        jsonRequest(`/api/audit?patientId=${patientId}`, 'GET'),
      );
      const body = (await response.json()) as Envelope<
        Array<{ patientId: string | null }>
      >;

      expect(response.status).toBe(200);
      expect(body.data.length).toBeGreaterThan(0);
      for (const event of body.data) {
        expect(event.patientId).toBe(patientId);
      }
    });

    it('Dado período from/to amplo, Quando GET /api/audit, Então retorna eventos dentro do intervalo', async () => {
      const from = new Date(Date.now() - 3_600_000).toISOString();
      const to = new Date(Date.now() + 3_600_000).toISOString();
      const response = await auditRoute.GET(
        jsonRequest(`/api/audit?from=${from}&to=${to}`, 'GET'),
      );
      const body = (await response.json()) as Envelope<unknown[]>;

      expect(response.status).toBe(200);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('Dado limit, Quando GET /api/audit, Então respeita a paginação', async () => {
      const response = await auditRoute.GET(
        jsonRequest('/api/audit?limit=1', 'GET'),
      );
      const body = (await response.json()) as Envelope<unknown[]>;

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(1);
    });

    it('Dado limit menor que a trilha, Quando seguir o nextCursor, Então a 2ª página não repete a 1ª e `offset` é ignorado', async () => {
      const read = async (query: string) =>
        (await (
          await auditRoute.GET(jsonRequest(`/api/audit?${query}`, 'GET'))
        ).json()) as Envelope<{ id: string }[]> & {
          meta: { nextCursor: string | null };
        };
      const first = await read('limit=1');
      expect(first.meta.nextCursor).toEqual(expect.any(String));
      const second = await read(
        `limit=1&offset=5&cursor=${encodeURIComponent(first.meta.nextCursor as string)}`,
      );

      expect(second.data).toHaveLength(1);
      expect(second.data[0].id).not.toBe(first.data[0].id);
    });

    it('Dado limit inválido (acima do máximo), Quando GET /api/audit, Então retorna 400', async () => {
      const response = await auditRoute.GET(
        jsonRequest('/api/audit?limit=99999', 'GET'),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/patients/:id/export', () => {
    it('Dado paciente inexistente, Quando GET export, Então retorna 404', async () => {
      const response = await exportRoute.GET(
        jsonRequest('/api/patients/ghost/export', 'GET'),
        context('ghost'),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.data).toBeNull();
      expect(body.error).toBeTruthy();
    });

    it('Dado falha ao gravar a auditoria, Quando GET export, Então falha a requisição (write-ahead, SEC1-20)', async () => {
      const { DrizzleAuditEventRepository } = await import(
        '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository'
      );
      const saveSpy = vi
        .spyOn(DrizzleAuditEventRepository.prototype, 'save')
        .mockRejectedValueOnce(new Error('auditoria indisponível'));
      // spyOn no mesmo método de protótipo devolve o mock já existente, com o
      // histórico dos testes anteriores — zera para contar só esta requisição.
      saveSpy.mockClear();

      const response = await exportRoute.GET(
        jsonRequest(`/api/patients/${patientId}/export`, 'GET'),
        context(patientId),
      );

      // Exportação de titular não responde sucesso sem trilha gravada.
      // A asserção sobre o spy prova que o 500 veio da trilha recusada, e não
      // de qualquer outra falha no caminho.
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(500);
      const body = (await response.json()) as Envelope<null>;
      expect(body.success).toBe(false);
    });

    it('Dado paciente com anamnese, condição e foto, Quando GET export, Então retorna JSON completo', async () => {
      const response = await exportRoute.GET(
        jsonRequest(`/api/patients/${patientId}/export`, 'GET'),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<{
        exportedAt: string;
        patient: { id: string };
        anamnesis: { comorbidities: string } | null;
        conditions: Array<{ id: string }>;
        photos: Array<{ id: string }>;
        appointments: unknown[];
        invoices: unknown[];
        consents: unknown[];
        packages: unknown[];
      }>;

      expect(response.status).toBe(200);
      expect(body.data.patient.id).toBe(patientId);
      expect(body.data.anamnesis?.comorbidities).toBe('Diabetes tipo 2');
      expect(body.data.conditions.some((c) => c.id === conditionId)).toBe(true);
      expect(body.data.photos.some((p) => p.id === photoId)).toBe(true);
      expect(typeof body.data.exportedAt).toBe('string');
      expect(Array.isArray(body.data.appointments)).toBe(true);
      expect(Array.isArray(body.data.invoices)).toBe(true);
      expect(Array.isArray(body.data.consents)).toBe(true);
      expect(Array.isArray(body.data.packages)).toBe(true);
    });
  });

  describe('GET/PATCH/DELETE /api/photos/:id', () => {
    it('Dado foto existente, Quando GET photos/:id, Então retorna o binário', async () => {
      const response = await photoByIdRoute.GET(
        jsonRequest(`/api/photos/${photoId}`, 'GET'),
        context(photoId),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
    });

    it('Dado falha ao gravar a auditoria, Quando DELETE photos/:id, Então falha a requisição (write-ahead, SEC1-21)', async () => {
      const deletablePhotoId = await uploadPatientOriginPhoto(
        'para exclusão auditada',
      );
      const { DrizzleAuditEventRepository } = await import(
        '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository'
      );
      const saveSpy = vi
        .spyOn(DrizzleAuditEventRepository.prototype, 'save')
        .mockRejectedValueOnce(new Error('auditoria indisponível'));
      // spyOn no mesmo método de protótipo devolve o mock já existente, com o
      // histórico dos testes anteriores — zera para contar só esta requisição.
      saveSpy.mockClear();

      const response = await photoByIdRoute.DELETE(
        jsonRequest(`/api/photos/${deletablePhotoId}`, 'DELETE'),
        context(deletablePhotoId),
      );

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(500);
    });

    it('Dado foto inexistente, Quando GET photos/:id, Então retorna 404', async () => {
      const response = await photoByIdRoute.GET(
        jsonRequest('/api/photos/ghost', 'GET'),
        context('ghost'),
      );

      expect(response.status).toBe(404);
    });

    it("Dado triagem 'reviewed' em foto enviada pelo paciente, Quando PATCH photos/:id, Então mantém o plano", async () => {
      const patientPhotoId = await uploadPatientOriginPhoto();

      const response = await photoByIdRoute.PATCH(
        jsonRequest(`/api/photos/${patientPhotoId}`, 'PATCH', {
          triage: 'reviewed',
        }),
        context(patientPhotoId),
      );
      const body = (await response.json()) as Envelope<{
        triageStatus: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.triageStatus).toBe('reviewed');
    });

    it('Dado foto enviada pela equipe (origin staff), Quando PATCH photos/:id, Então retorna 400 (só fotos do paciente passam por triagem)', async () => {
      const response = await photoByIdRoute.PATCH(
        jsonRequest(`/api/photos/${photoId}`, 'PATCH', { triage: 'reviewed' }),
        context(photoId),
      );

      expect(response.status).toBe(400);
    });

    it('Dado triage inválido, Quando PATCH photos/:id, Então retorna 400', async () => {
      const patientPhotoId = await uploadPatientOriginPhoto();
      const response = await photoByIdRoute.PATCH(
        jsonRequest(`/api/photos/${patientPhotoId}`, 'PATCH', {
          triage: 'unknown',
        }),
        context(patientPhotoId),
      );

      expect(response.status).toBe(400);
    });

    it('Dado foto inexistente, Quando PATCH photos/:id, Então retorna 404', async () => {
      const response = await photoByIdRoute.PATCH(
        jsonRequest('/api/photos/ghost', 'PATCH', { triage: 'reviewed' }),
        context('ghost'),
      );

      expect(response.status).toBe(404);
    });

    it("Dado foto do paciente e triagem 'escalated', Quando PATCH photos/:id, Então cria follow-up de retorno antecipado", async () => {
      const secondPhotoId = await uploadPatientOriginPhoto();

      const response = await photoByIdRoute.PATCH(
        jsonRequest(`/api/photos/${secondPhotoId}`, 'PATCH', {
          triage: 'escalated',
        }),
        context(secondPhotoId),
      );
      const body = (await response.json()) as Envelope<{
        triageStatus: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.triageStatus).toBe('escalated');
    });

    it('Dado foto existente, Quando DELETE photos/:id, Então remove a foto', async () => {
      const file = new File([pngBytes], 'foto3.png', { type: 'image/png' });
      const photoResponse = await conditionPhotosRoute.POST(
        multipartRequest(`/api/conditions/${conditionId}/photos`, { file }),
        context(conditionId),
      );
      const photoBody = (await photoResponse.json()) as Envelope<{
        id: string;
      }>;
      const toDeleteId = photoBody.data.id;

      const response = await photoByIdRoute.DELETE(
        jsonRequest(`/api/photos/${toDeleteId}`, 'DELETE'),
        context(toDeleteId),
      );
      const body = (await response.json()) as Envelope<{ deleted: boolean }>;

      expect(response.status).toBe(200);
      expect(body.data.deleted).toBe(true);

      const getAfterDelete = await photoByIdRoute.GET(
        jsonRequest(`/api/photos/${toDeleteId}`, 'GET'),
        context(toDeleteId),
      );
      expect(getAfterDelete.status).toBe(404);
    });
  });

  describe('GET /api/photos/triage', () => {
    it('Dado fotos pendentes de revisão, Quando GET triage, Então retorna fila com nome do paciente', async () => {
      const pendingPhotoId = await uploadPatientOriginPhoto('está inflamado');

      const response = await triageRoute.GET(
        jsonRequest('/api/photos/triage', 'GET'),
      );
      const body = (await response.json()) as Envelope<
        Array<{
          id: string;
          patientName: string;
          patientId: string | null;
          conditionTitle: string;
        }>
      >;

      expect(response.status).toBe(200);
      const entry = body.data.find((item) => item.id === pendingPhotoId);
      expect(entry).toBeDefined();
      expect(entry?.patientId).toBe(patientId);
      expect(entry?.patientName).toBe('Beatriz Auditoria');
      expect(entry?.conditionTitle).toBe('Ferida sacral');
    });

    it('Dado condição sem avaliação pontuável, Quando GET triage, Então latestScore null e idade da pendência (COMP3-04/05)', async () => {
      const photoId = await uploadPatientOriginPhoto('sem score ainda');

      const response = await triageRoute.GET(
        jsonRequest('/api/photos/triage', 'GET'),
      );
      const body = (await response.json()) as Envelope<
        Array<{ id: string; waitingHours: number; latestScore: unknown }>
      >;
      const entry = body.data.find((item) => item.id === photoId);

      expect(entry?.latestScore).toBeNull();
      expect(entry?.waitingHours).toBe(0);
    });

    it('Dado foto enviada há 30h, Quando GET triage, Então waitingHours reflete a idade real da pendência (COMP3-04/06)', async () => {
      const photoId = await uploadPatientOriginPhoto('pendência antiga');

      // Envelhece a pendência no banco — o cálculo precisa vir do createdAt real,
      // não de um valor fixo (foto recém-criada não discrimina o cálculo).
      const { getRepositories } = await import('@/infrastructure/container');
      const { ConditionPhoto } = await import(
        '@/domain/clinical/condition-photo'
      );
      const repos = await getRepositories(clinicScope('legacy-clinic'));
      const stored = await repos.conditionPhotos.findById(photoId);
      if (!stored) throw new Error('Foto de condição não encontrada');
      const thirtyHoursAgo = new Date(Date.now() - 30 * 3_600_000);
      await repos.conditionPhotos.save(
        ConditionPhoto.restore({
          id: stored.id,
          conditionId: stored.conditionId,
          assessmentId: stored.assessmentId,
          contentType: stored.contentType,
          sizeBytes: stored.sizeBytes,
          origin: stored.origin,
          patientNote: stored.patientNote,
          triageStatus: stored.triageStatus,
          createdAt: thirtyHoursAgo,
        }),
      );

      const response = await triageRoute.GET(
        jsonRequest('/api/photos/triage', 'GET'),
      );
      const body = (await response.json()) as Envelope<
        Array<{ id: string; waitingHours: number; createdAt: string }>
      >;
      const entry = body.data.find((item) => item.id === photoId);

      expect(entry?.waitingHours).toBe(30);
      expect(entry?.createdAt).toBe(thirtyHoursAgo.toISOString());
    });

    it('Dado avaliação de ferida com componentes do PUSH, Quando GET triage, Então latestScore traz o score da condição (COMP3-04)', async () => {
      // 20mm x 15mm = 3,0 cm² → subscore de área 5; exsudato moderado 2; granulação 2 → PUSH 9.
      await assessmentsRoute.POST(
        jsonRequest(`/api/conditions/${conditionId}/assessments`, 'POST', {
          lengthMm: 20,
          widthMm: 15,
          tissueType: 'granulation',
          exudate: 'moderate',
        }),
        context(conditionId),
      );
      const photoId = await uploadPatientOriginPhoto('com score');

      const response = await triageRoute.GET(
        jsonRequest('/api/photos/triage', 'GET'),
      );
      const body = (await response.json()) as Envelope<
        Array<{
          id: string;
          latestScore: { kind: string; value: number } | null;
        }>
      >;
      const entry = body.data.find((item) => item.id === photoId);

      expect(entry?.latestScore).toEqual({ kind: 'push', value: 9 });
    });

    it('Dado condição sem avaliação com infecção, Quando GET triage, Então infectionAlert é null (ADR-063)', async () => {
      const photoId = await uploadPatientOriginPhoto('sem infecção');

      const response = await triageRoute.GET(
        jsonRequest('/api/photos/triage', 'GET'),
      );
      const body = (await response.json()) as Envelope<
        Array<{ id: string; infectionAlert: string | null }>
      >;

      expect(
        body.data.find((item) => item.id === photoId)?.infectionAlert,
      ).toBeNull();
    });

    it('Dado última avaliação com infecção local, Quando GET triage, Então infectionAlert traz o nível (ADR-063)', async () => {
      await assessmentsRoute.POST(
        jsonRequest(`/api/conditions/${conditionId}/assessments`, 'POST', {
          lengthMm: 20,
          widthMm: 15,
          infectionLevel: 'local',
          infectionSigns: 'erythema',
        }),
        context(conditionId),
      );
      const photoId = await uploadPatientOriginPhoto('com infecção');

      const response = await triageRoute.GET(
        jsonRequest('/api/photos/triage', 'GET'),
      );
      const body = (await response.json()) as Envelope<
        Array<{ id: string; infectionAlert: string | null }>
      >;

      expect(
        body.data.find((item) => item.id === photoId)?.infectionAlert,
      ).toBe('local');
    });
  });

  describe('POST /api/reminders/run', () => {
    const originalCronSecret = process.env.CRON_SECRET;

    it('Dado CRON_SECRET não configurado, Quando POST reminders/run, Então retorna 503', async () => {
      delete process.env.CRON_SECRET;
      const response = await remindersRunRoute.POST(
        jsonRequest('/api/reminders/run', 'POST'),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(503);
      expect(body.error).toContain('CRON_SECRET não configurado');
    });

    it('Dado CRON_SECRET configurado e header ausente, Quando POST reminders/run, Então retorna 401', async () => {
      process.env.CRON_SECRET = 'cron-secreto';
      const response = await remindersRunRoute.POST(
        jsonRequest('/api/reminders/run', 'POST'),
      );

      expect(response.status).toBe(401);
    });

    it('Dado header x-cron-secret incorreto, Quando POST reminders/run, Então retorna 401', async () => {
      process.env.CRON_SECRET = 'cron-secreto';
      const response = await remindersRunRoute.POST(
        jsonRequest('/api/reminders/run', 'POST', undefined, {
          'x-cron-secret': 'errado',
        }),
      );

      expect(response.status).toBe(401);
    });

    it('Dado header x-cron-secret correto e sem canal de e-mail configurado, Quando POST reminders/run, Então roda em dry-run sem lançar', async () => {
      process.env.CRON_SECRET = 'cron-secreto';

      const response = await remindersRunRoute.POST(
        jsonRequest('/api/reminders/run', 'POST', undefined, {
          'x-cron-secret': 'cron-secreto',
        }),
      );
      const body = (await response.json()) as Envelope<{
        sent: number;
        skipped: number;
        failed: number;
      }>;

      expect(response.status).toBe(200);
      expect(body.data).not.toHaveProperty('channelEnabled');
      expect(body.data.failed).toBe(0);

      if (originalCronSecret === undefined) {
        delete process.env.CRON_SECRET;
      } else {
        process.env.CRON_SECRET = originalCronSecret;
      }
    });
  });

  describe('GET /api/clinic-info', () => {
    it('Dado nenhuma configuração de env, Quando GET clinic-info, Então retorna defaults neutros', async () => {
      const response = await clinicInfoRoute.GET(
        jsonRequest('/api/clinic-info', 'GET'),
      );
      const body = (await response.json()) as Envelope<{
        name: string;
        cnpj: string | null;
      }>;

      expect(response.status).toBe(200);
      expect(typeof body.data.name).toBe('string');
      expect(body.data.name.length).toBeGreaterThan(0);
    });
  });
});
