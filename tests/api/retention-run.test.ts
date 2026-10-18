import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Clinic } from '@/domain/clinic/clinic';
import { ANONYMIZED_PATIENT_NAME } from '@/domain/retention/retention-policy';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const CLINIC_ID = 'ret-rota';
const OLD = new Date('2001-03-01T12:00:00Z');

interface ClinicEntry {
  clinicId: string;
  clinicalRecords: number;
  photos: number;
  auditEvents: number;
  waitlistEntries: number;
  accounts: number;
}

interface Envelope {
  success: boolean;
  data: {
    clinicalRecords: number;
    photos: number;
    platform: { auditEvents: number };
    clinics: ClinicEntry[];
  };
}

let uploads: string;

async function post(headers: Record<string, string> = {}) {
  const route = await import('@/app/api/retention/run/route');
  return route.POST(
    jsonRequest('/api/retention/run', 'POST', undefined, headers),
  );
}

describe('Feature: Rota do job de retenção (#294, RET-01, RET-08)', () => {
  beforeAll(async () => {
    uploads = await mkdtemp(path.join(tmpdir(), 'ret-uploads-'));
    vi.stubEnv('UPLOADS_DIR', uploads);
    const { clinics } = await getRepositories(systemScope());
    await clinics.create(
      Clinic.restore({
        id: CLINIC_ID,
        name: 'Clínica Retenção',
        createdBy: 'fixture',
        createdAt: OLD,
      }),
    );
    const db = await getDb();
    await db.insert(schema.patients).values({
      id: 'ret-paciente',
      clinicId: CLINIC_ID,
      fullName: 'Joana Antiga',
      email: 'joana-antiga@x.com',
      phone: '11999990000',
      createdAt: OLD,
    });
    await db.insert(schema.clinicalConditions).values({
      id: 'ret-condicao',
      clinicId: CLINIC_ID,
      patientId: 'ret-paciente',
      kind: 'wound',
      title: 'Úlcera',
      status: 'healed',
      createdAt: OLD,
    });
    await db.insert(schema.conditionPhotos).values({
      id: 'ret-foto',
      clinicId: CLINIC_ID,
      conditionId: 'ret-condicao',
      contentType: 'image/jpeg',
      sizeBytes: 3,
      createdAt: OLD,
    });
    await db.insert(schema.auditEvents).values({
      id: 'ret-evento-plataforma',
      clinicId: null,
      actorRole: 'anonymous',
      actorId: 'anonymous',
      action: 'read',
      resourceType: 'login',
      resourceId: 'quem-errou@x.com',
      occurredAt: OLD,
    });
    const { photoStorage } = await getRepositories(clinicScope(CLINIC_ID));
    await photoStorage.write('ret-foto', new Uint8Array([1, 2, 3]));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('UPLOADS_DIR', uploads);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await rm(uploads, { recursive: true, force: true });
  });

  it('Dado CRON_SECRET ausente, Então 503; segredo errado, Então 401', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await post({ 'x-cron-secret': 'x' })).status).toBe(503);

    vi.stubEnv('CRON_SECRET', 'cron-secreto');
    expect((await post({ 'x-cron-secret': 'errado' })).status).toBe(401);
    const route = await import('@/app/api/retention/run/route');
    const get = await route.GET(
      jsonRequest('/api/retention/run', 'GET', undefined, {
        authorization: 'Bearer errado',
      }),
    );
    expect(get.status).toBe(401);
    const noBearer = await route.GET(
      jsonRequest('/api/retention/run', 'GET', undefined, {
        authorization: 'cron-secreto',
      }),
    );
    expect(noBearer.status).toBe(401);
  });

  it('Dado prontuário de 25 anos, Quando o cron roda, Então anonimiza, apaga o arquivo e audita; de novo, Então nada muda', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secreto');
    const { photoStorage } = await getRepositories(clinicScope(CLINIC_ID));
    expect(await photoStorage.read('ret-foto')).not.toBeNull();

    const first = await post({ 'x-cron-secret': 'cron-secreto' });
    expect(first.status).toBe(200);
    const body = (await first.json()) as Envelope;
    const entry = body.data.clinics.find((c) => c.clinicId === CLINIC_ID);
    expect(entry).toMatchObject({ clinicalRecords: 1, photos: 1 });
    expect(body.data.platform.auditEvents).toBeGreaterThanOrEqual(1);

    expect(await photoStorage.read('ret-foto')).toBeNull();
    const db = await getDb();
    const [patient] = await db
      .select()
      .from(schema.patients)
      .where(eq(schema.patients.id, 'ret-paciente'));
    expect(patient.fullName).toBe(ANONYMIZED_PATIENT_NAME);
    const [photo] = await db
      .select()
      .from(schema.conditionPhotos)
      .where(eq(schema.conditionPhotos.id, 'ret-foto'));
    expect(photo.anonymizedAt).toBeInstanceOf(Date);
    expect(photo.sizeBytes).toBe(3);
    const runs = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.resourceType, 'retention'));
    const clinicRun = runs.find((run) => run.clinicId === CLINIC_ID);
    expect(clinicRun).toMatchObject({ actorRole: 'system', patientId: null });
    expect(JSON.parse(clinicRun?.detail ?? '')).toMatchObject({
      clinicalRecords: 1,
      photos: 1,
    });
    expect(runs.some((run) => run.clinicId === null)).toBe(true);

    const route = await import('@/app/api/retention/run/route');
    const second = await route.GET(
      jsonRequest('/api/retention/run', 'GET', undefined, {
        authorization: 'Bearer cron-secreto',
      }),
    );
    const again = (await second.json()) as Envelope;
    expect(again.data.clinicalRecords).toBe(0);
    expect(again.data.photos).toBe(0);
    expect(again.data.platform.auditEvents).toBe(0);
    const runsAfter = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.resourceType, 'retention'));
    // A clínica não ganha evento novo; a plataforma registra a execução (#323).
    expect(runsAfter.filter((run) => run.clinicId !== null)).toHaveLength(
      runs.filter((run) => run.clinicId !== null).length,
    );
    expect(runsAfter.filter((run) => run.clinicId === null)).toHaveLength(
      runs.filter((run) => run.clinicId === null).length + 1,
    );
  });
});
