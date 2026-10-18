import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { getRepositories } from '@/infrastructure/container';
import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';
import { createSessionToken } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { IMAGE_CONSENT_TEXT } from '@/lib/image-consent-text';
import { CLINIC_A_ID, completeClinicRegistration } from '../support/clinics';
import { linkPortalAccount } from '../support/portal-account';
import { jsonRequest as staffRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';
process.env.AUTH_SECRET = 'test-secret-e2e';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const portalRequest = (url: string, method: string, token: string) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { cookie: `vitta_session=${token}` },
  });

describe('Feature: Termos de tratamento e de imagem à parte (#216, ADR-030)', () => {
  let consentRoute: typeof import('@/app/api/portal/patient/consent/route');
  let revokeRoute: typeof import('@/app/api/portal/patient/consent/revoke/route');
  let noticeRoute: typeof import('@/app/api/portal/privacy-notice/route');
  let controllerRoute: typeof import('@/app/api/clinic-info/legal-controller/route');
  let clinicInfoRoute: typeof import('@/app/api/settings/clinic-info/route');
  let patientToken: string;
  let patientId: string;

  const patientCookie = () => patientToken;

  const status = async (purpose?: string) => {
    const url = `/api/portal/patient/consent${purpose ? `?purpose=${purpose}` : ''}`;
    const response = await consentRoute.GET(
      portalRequest(url, 'GET', patientCookie()),
    );
    return {
      status: response.status,
      body: (await response.json()) as Envelope<{
        purpose: string;
        consentText: string;
        accepted: boolean;
        revoked: boolean;
      }>,
    };
  };

  const accept = (purpose?: string) =>
    consentRoute.POST(
      portalRequest(
        `/api/portal/patient/consent${purpose ? `?purpose=${purpose}` : ''}`,
        'POST',
        patientCookie(),
      ),
    );

  beforeAll(async () => {
    await completeClinicRegistration(CLINIC_A_ID);
    consentRoute = await import('@/app/api/portal/patient/consent/route');
    revokeRoute = await import('@/app/api/portal/patient/consent/revoke/route');
    noticeRoute = await import('@/app/api/portal/privacy-notice/route');
    controllerRoute = await import(
      '@/app/api/clinic-info/legal-controller/route'
    );
    clinicInfoRoute = await import('@/app/api/settings/clinic-info/route');
    const patientsRoute = await import('@/app/api/patients/route');

    const email = 'termos.paciente@example.com';
    const created = await patientsRoute.POST(
      staffRequest('/api/patients', 'POST', {
        fullName: 'Marta Termos',
        email,
        phone: '11977770000',
      }),
    );
    patientId = ((await created.json()) as Envelope<{ id: string }>).data.id;
    await linkPortalAccount({ role: 'patient', email, recordId: patientId });
    patientToken = createSessionToken(
      process.env.AUTH_SECRET as string,
      Date.now() + 3_600_000,
      email,
      'patient',
      LEGACY_CLINIC_ID,
    );
  });

  it('Dado o paciente, Quando ler o termo de tratamento e o de imagem, Então são textos diferentes, com a clínica já interpolada', async () => {
    const treatment = await status();
    const image = await status('image');

    expect(treatment.body.data.purpose).toBe('treatment');
    expect(image.body.data.purpose).toBe('image');
    expect(treatment.body.data.consentText).toContain(
      'TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO',
    );
    expect(image.body.data.consentText).toContain(
      'TERMO DE AUTORIZAÇÃO DE IMAGEM',
    );
    expect(treatment.body.data.consentText).not.toMatch(/\{\{/);
    expect(image.body.data.consentText).not.toMatch(/\{\{/);
    expect(treatment.body.data.consentText).toContain('CNPJ');
    expect(treatment.body.data.accepted).toBe(false);
  });

  it('Dada finalidade inválida, Quando ler ou aceitar, Então 400', async () => {
    expect((await status('marketing')).status).toBe(400);
    expect((await accept('marketing')).status).toBe(400);
  });

  it('Dado o aceite da imagem, Então o tratamento continua pendente e o aceite guarda o snapshot da clínica', async () => {
    expect((await accept('image')).status).toBe(200);

    expect((await status('image')).body.data.accepted).toBe(true);
    expect((await status()).body.data.accepted).toBe(false);

    const { consentRecords } = await getRepositories(
      clinicScope(LEGACY_CLINIC_ID),
    );
    const [record] = await consentRecords.findByPatientId(patientId);
    expect(record.purpose).toBe('image');
    expect(record.textVersion).toBe('v1');
    expect(record.controllerSnapshot).toContain('CNPJ');
    expect(record.controllerSnapshot).toContain('Encarregado:');
    // O hash é do texto-base: trocar a clínica não derruba o aceite.
    expect(record.textHash).toBe(
      ConsentRecord.create({
        patientId,
        consentText: IMAGE_CONSENT_TEXT,
        textVersion: 'v1',
      }).textHash,
    );
  });

  it('Dado aceite repetido, Então devolve o existente sem gravar outro', async () => {
    const before = await (
      await getRepositories(clinicScope(LEGACY_CLINIC_ID))
    ).consentRecords.findByPatientId(patientId);

    expect((await accept('image')).status).toBe(200);

    const after = await (
      await getRepositories(clinicScope(LEGACY_CLINIC_ID))
    ).consentRecords.findByPatientId(patientId);
    expect(after).toHaveLength(before.length);
  });

  it('Dada a revogação da imagem, Então o tratamento aceito antes segue valendo', async () => {
    expect((await accept()).status).toBe(200);

    const revoked = await revokeRoute.POST(
      portalRequest(
        '/api/portal/patient/consent/revoke?purpose=image',
        'POST',
        patientCookie(),
      ),
    );
    expect(revoked.status).toBe(200);

    expect((await status('image')).body.data.revoked).toBe(true);
    expect((await status('image')).body.data.accepted).toBe(false);
    expect((await status()).body.data.accepted).toBe(true);
  });

  it('Dada a revogação sem finalidade, Então vale para o tratamento', async () => {
    const revoked = await revokeRoute.POST(
      portalRequest(
        '/api/portal/patient/consent/revoke',
        'POST',
        patientCookie(),
      ),
    );

    expect(revoked.status).toBe(200);
    expect((await status()).body.data.revoked).toBe(true);
  });

  it('Dado o aviso de privacidade no portal, Então vem com a clínica e exige sessão de portal', async () => {
    const ok = await noticeRoute.GET(
      portalRequest('/api/portal/privacy-notice', 'GET', patientCookie()),
    );
    const body = (await ok.json()) as Envelope<{
      version: string;
      text: string;
    }>;

    expect(ok.status).toBe(200);
    expect(body.data.version).toBe('v3');
    expect(body.data.text).toContain('AVISO DE PRIVACIDADE');
    expect(body.data.text).not.toMatch(/\{\{/);
    expect(body.data.text).toContain('CNPJ');

    const anonymous = await noticeRoute.GET(
      new NextRequest('http://localhost/api/portal/privacy-notice'),
    );
    expect(anonymous.status).toBe(401);
    const staff = await noticeRoute.GET(
      staffRequest('/api/portal/privacy-notice', 'GET'),
    );
    expect(staff.status).toBe(403);
  });

  it('Dado o encarregado cadastrado em Configurações, Então os termos passam a trazê-lo', async () => {
    const saved = await clinicInfoRoute.PUT(
      staffRequest(
        '/api/settings/clinic-info',
        'PUT',
        { dpoName: 'Beatriz Lima', dpoContact: 'privacidade@clinica.test' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    expect(saved.status).toBe(200);
    const info = (await saved.json()) as Envelope<{
      info: { dpoName: string; dpoContact: string };
    }>;
    expect(info.data.info.dpoName).toBe('Beatriz Lima');

    expect((await status('image')).body.data.consentText).toContain(
      'Beatriz Lima, privacidade@clinica.test',
    );
    const controller = await controllerRoute.GET(
      staffRequest('/api/clinic-info/legal-controller', 'GET'),
    );
    expect(controller.status).toBe(200);
    expect(
      ((await controller.json()) as Envelope<{ dpoName: string }>).data.dpoName,
    ).toBe('Beatriz Lima');
  });

  it('Dado nome do encarregado sem canal, Quando salvar, Então 400', async () => {
    const saved = await clinicInfoRoute.PUT(
      staffRequest(
        '/api/settings/clinic-info',
        'PUT',
        { dpoName: 'Beatriz Lima', dpoContact: '' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );

    expect(saved.status).toBe(400);
  });

  it('Dada clínica sem CNPJ ou canal, Quando aceitar ou ler o termo impresso, Então 409', async () => {
    const { clinics } = await getRepositories(clinicScope(LEGACY_CLINIC_ID));
    const clinic = await clinics.findById(LEGACY_CLINIC_ID);
    if (!clinic) throw new Error('clínica legada ausente');
    const original = clinic;
    await clinics.update(
      clinic.updateInfo({ cnpj: null, contactEmail: null, contactPhone: null }),
    );

    try {
      expect((await accept('image')).status).toBe(409);
      expect((await status()).status).toBe(409);
      const printed = await controllerRoute.GET(
        staffRequest('/api/clinic-info/legal-controller', 'GET'),
      );
      expect(printed.status).toBe(409);
    } finally {
      await clinics.update(original);
    }
  });

  it('Dada sessão de equipe, Quando pedir o controlador, Então qualquer papel lê (recepção imprime)', async () => {
    const response = await controllerRoute.GET(
      staffRequest(
        '/api/clinic-info/legal-controller',
        'GET',
        undefined,
        cookieHeaderFor('atendente'),
      ),
    );

    expect(response.status).toBe(200);
  });
});
