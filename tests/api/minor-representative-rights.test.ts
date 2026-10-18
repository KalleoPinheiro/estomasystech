import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { zonedParts } from '@/domain/shared/time-zone';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  completeClinicRegistration,
  ensureTestClinics,
} from '../support/clinics';
import { linkPortalAccount } from '../support/portal-account';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor, sessionToken } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const admin = () =>
  cookieHeaderFor('company_admin', 'admin-rights@x.com', CLINIC_A_ID);
let counter = 0;
const unique = (prefix: string) => {
  counter += 1;
  return `${prefix}-${counter}-${Date.now()}@x.com`;
};
const sessionCookie = (
  role: 'guardian' | 'patient' | 'partner',
  email: string,
) => ({
  cookie: `${SESSION_COOKIE}=${sessionToken(role, email, undefined, CLINIC_A_ID)}`,
});
const portalRequest = (
  url: string,
  headers: Record<string, string>,
  method = 'GET',
  body?: unknown,
) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async <T>(response: Response) =>
  ((await response.json()) as Envelope<T>).data;

/** Nascimento `years` anos (e `extraDays` dias) antes de hoje no fuso da aplicação. */
const bornYearsAgo = (years: number, extraDays = 0) => {
  const today = zonedParts(new Date());
  return new Date(
    Date.UTC(today.year - years, today.month - 1, today.day + extraDays),
  ).toISOString();
};

const PARTNER_URL = '/api/portal/patient/partner-consent';
const TREATMENT_URL = '/api/portal/patient/consent?purpose=treatment';

describe('Feature: direitos do menor pelo representante e prazo de 90 dias (#375, ADR-033)', () => {
  let guardiansRoute: typeof import('@/app/api/guardians/route');
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientByIdRoute: typeof import('@/app/api/patients/[id]/route');
  let accountsRoute: typeof import('@/app/api/accounts/route');
  let exportRoute: typeof import('@/app/api/portal/patient/export/route');
  let dataRequestsRoute: typeof import('@/app/api/portal/patient/data-requests/route');
  let partnerConsentRoute: typeof import('@/app/api/portal/patient/partner-consent/route');
  let partnerRevokeRoute: typeof import('@/app/api/portal/patient/partner-consent/revoke/route');
  let consentRoute: typeof import('@/app/api/portal/patient/consent/route');
  let partnerPortalRoute: typeof import('@/app/api/portal/partner/route');
  let majorityRoute: typeof import('@/app/api/guardians/majority/route');
  let partnerId: string;
  const partnerEmail = unique('parceiro');

  beforeAll(async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    guardiansRoute = await import('@/app/api/guardians/route');
    patientsRoute = await import('@/app/api/patients/route');
    patientByIdRoute = await import('@/app/api/patients/[id]/route');
    accountsRoute = await import('@/app/api/accounts/route');
    exportRoute = await import('@/app/api/portal/patient/export/route');
    dataRequestsRoute = await import(
      '@/app/api/portal/patient/data-requests/route'
    );
    partnerConsentRoute = await import(
      '@/app/api/portal/patient/partner-consent/route'
    );
    partnerRevokeRoute = await import(
      '@/app/api/portal/patient/partner-consent/revoke/route'
    );
    consentRoute = await import('@/app/api/portal/patient/consent/route');
    partnerPortalRoute = await import('@/app/api/portal/partner/route');
    majorityRoute = await import('@/app/api/guardians/majority/route');

    const partners = await import('@/app/api/partners/route');
    partnerId = (
      await json<{ id: string }>(
        await partners.POST(
          jsonRequest(
            '/api/partners',
            'POST',
            {
              fullName: 'Dr. Indicador 375',
              email: partnerEmail,
              phone: '11933332222',
            },
            admin(),
          ),
        ),
      )
    ).id;
    await linkPortalAccount({
      role: 'partner',
      email: partnerEmail,
      recordId: partnerId,
      clinicId: CLINIC_A_ID,
    });
  });

  /** Menor indicado pelo parceiro, com a mãe no portal. */
  const minorWithMother = async (fullName: string, birthDate: string) => {
    const mother = (
      await json<{ id: string }>(
        await guardiansRoute.POST(
          jsonRequest(
            '/api/guardians',
            'POST',
            { fullName: 'Rita Mãe', relationship: 'mae', phone: '11999990000' },
            admin(),
          ),
        ),
      )
    ).id;
    const patientId = (
      await json<{ id: string }>(
        await patientsRoute.POST(
          jsonRequest(
            '/api/patients',
            'POST',
            {
              fullName,
              phone: '11911112222',
              birthDate,
              guardianId: mother,
              referredByPartnerId: partnerId,
            },
            admin(),
          ),
        ),
      )
    ).id;
    const email = unique('mae');
    const granted = await accountsRoute.POST(
      jsonRequest(
        '/api/accounts',
        'POST',
        {
          email,
          role: 'guardian',
          guardianId: mother,
          guardianAuthorization: true,
        },
        admin(),
      ),
    );
    expect(granted.status).toBe(200);
    return { mother, patientId, headers: sessionCookie('guardian', email) };
  };

  const sharing = async (patientId: string) => {
    const response = await partnerPortalRoute.GET(
      portalRequest(
        '/api/portal/partner',
        sessionCookie('partner', partnerEmail),
      ),
    );
    expect(response.status).toBe(200);
    const data = await json<{
      referredPatients: Array<{ patient: { id: string }; sharing: boolean }>;
    }>(response);
    return data.referredPatients.find((entry) => entry.patient.id === patientId)
      ?.sharing;
  };

  it('a mãe baixa a cópia, pede correção e autoriza e revoga o parceiro pelo menor; eliminação é na clínica', async () => {
    const { mother, patientId, headers } = await minorWithMother(
      'Lia Menor',
      bornYearsAgo(10),
    );

    const exported = await exportRoute.GET(
      portalRequest('/api/portal/patient/export', headers),
    );
    expect(exported.status).toBe(200);

    const correction = await dataRequestsRoute.POST(
      portalRequest('/api/portal/patient/data-requests', headers, 'POST', {
        kind: 'correction',
        details: 'Telefone errado',
      }),
    );
    expect(correction.status).toBe(200);
    const listed = await dataRequestsRoute.GET(
      portalRequest('/api/portal/patient/data-requests', headers),
    );
    expect(await json<unknown[]>(listed)).toHaveLength(1);

    const erasure = await dataRequestsRoute.POST(
      portalRequest('/api/portal/patient/data-requests', headers, 'POST', {
        kind: 'erasure',
      }),
    );
    expect(erasure.status).toBe(403);
    expect(((await erasure.json()) as Envelope<null>).error).toContain(
      'diretamente à clínica',
    );

    const accepted = await partnerConsentRoute.POST(
      portalRequest(PARTNER_URL, headers, 'POST'),
    );
    expect(accepted.status).toBe(200);
    const status = await json<{
      active: boolean;
      signedByRelationship: string | null;
    }>(await partnerConsentRoute.GET(portalRequest(PARTNER_URL, headers)));
    expect(status).toMatchObject({ active: true, signedByRelationship: 'mae' });
    expect(await sharing(patientId)).toBe(true);

    const revoked = await partnerRevokeRoute.POST(
      portalRequest(`${PARTNER_URL}/revoke`, headers, 'POST'),
    );
    expect(revoked.status).toBe(200);
    expect(await sharing(patientId)).toBe(false);

    const { partnerShareConsents, auditEvents } = await getRepositories(
      clinicScope(CLINIC_A_ID),
    );
    const records = await partnerShareConsents.findByPatientId(patientId);
    expect(records.map((record) => record.signer?.guardianId)).toEqual([
      mother,
      mother,
    ]);
    const trail = await auditEvents.findAll({ patientId });
    expect(
      trail.filter((event) => event.detail?.includes('representante legal'))
        .length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('responsável de adulto não pede cópia, correção nem autoriza o parceiro (403)', async () => {
    const { headers } = await minorWithMother('Mia Adulta', bornYearsAgo(30));
    for (const response of [
      await exportRoute.GET(
        portalRequest('/api/portal/patient/export', headers),
      ),
      await dataRequestsRoute.POST(
        portalRequest('/api/portal/patient/data-requests', headers, 'POST', {
          kind: 'correction',
          details: 'x',
        }),
      ),
      await partnerConsentRoute.POST(
        portalRequest(PARTNER_URL, headers, 'POST'),
      ),
      await partnerRevokeRoute.POST(
        portalRequest(`${PARTNER_URL}/revoke`, headers, 'POST'),
      ),
    ]) {
      expect(response.status).toBe(403);
    }
  });

  it('90 dias depois dos 18, o aceite da mãe perde a validade até o paciente aceitar em nome próprio', async () => {
    const { patientId, headers } = await minorWithMother(
      'Nina Menor',
      bornYearsAgo(17),
    );
    for (const url of [TREATMENT_URL, PARTNER_URL]) {
      const route = url === PARTNER_URL ? partnerConsentRoute : consentRoute;
      expect(
        (await route.POST(portalRequest(url, headers, 'POST'))).status,
      ).toBe(200);
    }

    // A clínica corrige a data: fez 18 há 89 dias e o aceite ainda vale.
    const setBirth = (birthDate: string) =>
      patientByIdRoute.PUT(
        jsonRequest(
          `/api/patients/${patientId}`,
          'PUT',
          { birthDate },
          admin(),
        ),
        { params: Promise.resolve({ id: patientId }) },
      );
    await setBirth(bornYearsAgo(18, -89));
    const own = unique('nina');
    expect(
      (
        await accountsRoute.POST(
          jsonRequest(
            '/api/accounts',
            'POST',
            { email: own, role: 'patient', patientId },
            admin(),
          ),
        )
      ).status,
    ).toBe(200);
    const patient = sessionCookie('patient', own);
    const treatment = async () =>
      json<{ accepted: boolean; representativeExpired: boolean }>(
        await consentRoute.GET(portalRequest(TREATMENT_URL, patient)),
      );
    expect(await treatment()).toMatchObject({
      accepted: true,
      representativeExpired: false,
    });
    expect(await sharing(patientId)).toBe(true);

    const notice = async () =>
      (
        await json<
          Array<{
            patientId: string;
            awaitingTransfer: boolean;
            representativeConsentExpired: boolean;
          }>
        >(
          await majorityRoute.GET(
            jsonRequest('/api/guardians/majority', 'GET', undefined, admin()),
          ),
        )
      ).find((item) => item.patientId === patientId);
    expect(await notice()).toMatchObject({
      awaitingTransfer: false,
      representativeConsentExpired: false,
    });

    // Passou do prazo: o termo fica pendente e o médico deixa de ver.
    await setBirth(bornYearsAgo(18, -90));
    expect(await treatment()).toMatchObject({
      accepted: false,
      representativeExpired: true,
    });
    expect(await sharing(patientId)).toBe(false);
    expect(await notice()).toMatchObject({
      representativeConsentExpired: true,
    });

    // O paciente aceita em nome próprio: volta a valer e sai do aviso.
    for (const url of [TREATMENT_URL, PARTNER_URL]) {
      const route = url === PARTNER_URL ? partnerConsentRoute : consentRoute;
      expect(
        (await route.POST(portalRequest(url, patient, 'POST'))).status,
      ).toBe(200);
    }
    expect(await treatment()).toMatchObject({
      accepted: true,
      representativeExpired: false,
    });
    expect(await sharing(patientId)).toBe(true);
    expect(await notice()).toBeUndefined();
  });
});
