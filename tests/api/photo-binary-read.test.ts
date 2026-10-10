import { describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest, multipartRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const context = (id: string) => ({ params: Promise.resolve({ id }) });

/** `after()` roda fire-and-forget (mock global) — dá um respiro pro microtask concluir. */
const waitForAudit = () => new Promise((resolve) => setTimeout(resolve, 20));

const created = async (response: Response): Promise<string> => {
  const body = (await response.json()) as Envelope<{ id: string }>;
  return body.data.id;
};

/** Paciente + condição + foto criados pela equipe da clínica `clinicId`. */
async function seedPhoto(
  clinicId: string,
  email: string,
): Promise<{ patientId: string; photoId: string }> {
  await ensureTestClinics();
  const headers = adminCookieHeader(clinicId);
  const patients = await import('@/app/api/patients/route');
  const patientId = await created(
    await patients.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        { fullName: 'Paciente Foto', email, phone: '11999990000' },
        headers,
      ),
    ),
  );
  const conditions = await import('@/app/api/patients/[id]/conditions/route');
  const conditionId = await created(
    await conditions.POST(
      jsonRequest(
        `/api/patients/${patientId}/conditions`,
        'POST',
        { kind: 'wound', title: 'Ferida operatória' },
        headers,
      ),
      context(patientId),
    ),
  );
  const photos = await import('@/app/api/conditions/[id]/photos/route');
  const form = new FormData();
  form.set('file', new File([pngBytes], 'foto.png', { type: 'image/png' }));
  const photoId = await created(
    await photos.POST(
      multipartRequest(`/api/conditions/${conditionId}/photos`, form, headers),
      context(conditionId),
    ),
  );
  return { patientId, photoId };
}

async function readEvents(clinicId: string, photoId: string) {
  await waitForAudit();
  const { auditEvents } = await getRepositories(clinicScope(clinicId));
  const events = await auditEvents.findAll({
    resourceType: 'photo',
    resourceId: photoId,
  });
  return events.filter((event) => event.action === 'read');
}

const getPhoto = async (photoId: string, headers?: Record<string, string>) => {
  const route = await import('@/app/api/photos/[id]/route');
  return route.GET(
    jsonRequest(`/api/photos/${photoId}`, 'GET', undefined, headers),
    context(photoId),
  );
};

describe('Feature: Leitura do binário da foto clínica (#209)', () => {
  it('Dada sessão da própria clínica, Quando GET binário, Então responde no-store e sem max-age', async () => {
    const { photoId } = await seedPhoto(CLINIC_B_ID, 'foto-cache@x.com');

    const response = await getPhoto(photoId, adminCookieHeader(CLINIC_B_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('Dada sessão da própria clínica, Quando GET binário, Então grava evento read de photo com o paciente', async () => {
    const { patientId, photoId } = await seedPhoto(
      CLINIC_B_ID,
      'foto-audit@x.com',
    );

    const response = await getPhoto(photoId, adminCookieHeader(CLINIC_B_ID));
    expect(response.status).toBe(200);

    const reads = await readEvents(CLINIC_B_ID, photoId);
    expect(reads).toHaveLength(1);
    expect(reads[0]?.patientId).toBe(patientId);
    expect(reads[0]?.actorRole).toBe('company_admin');
    expect(reads[0]?.clinicId).toBe(CLINIC_B_ID);
  });

  it('Dada sessão de outra clínica, Quando GET binário, Então 404 e nenhuma leitura auditada', async () => {
    const { photoId } = await seedPhoto(CLINIC_B_ID, 'foto-alheia@x.com');

    const response = await getPhoto(photoId, adminCookieHeader(CLINIC_A_ID));

    expect(response.status).toBe(404);
    expect(await readEvents(CLINIC_B_ID, photoId)).toHaveLength(0);
  });

  it('Dada sessão super_admin, Quando GET binário de qualquer empresa, Então 403 (ADR-007, ACE-RN-10)', async () => {
    const { photoId } = await seedPhoto(CLINIC_B_ID, 'foto-super@x.com');

    const response = await getPhoto(
      photoId,
      cookieHeaderFor('super_admin', 'operador@vitta.com', null),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).not.toBe('image/png');
    expect(await readEvents(CLINIC_B_ID, photoId)).toHaveLength(0);
  });
});
