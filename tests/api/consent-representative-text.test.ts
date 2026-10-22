import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashConsentText } from '@/domain/consent/consent-record';
import { zonedParts } from '@/domain/shared/time-zone';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CONSENT_REPRESENTATIVE_TEXT } from '@/lib/consent-representative-text';
import {
  CLINIC_A_ID,
  completeClinicRegistration,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor, sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const admin = () =>
  cookieHeaderFor('company_admin', 'admin-minor@x.com', CLINIC_A_ID);
const atendente = () =>
  cookieHeaderFor('atendente', 'recepcao-minor@x.com', CLINIC_A_ID);
const profissional = () =>
  cookieHeaderFor('profissional', 'prof-minor@x.com', CLINIC_A_ID);
let counter = 0;
const unique = (prefix: string) => {
  counter += 1;
  return `${prefix}-${counter}-${Date.now()}@x.com`;
};
const sessionCookie = (role: 'guardian' | 'patient', email: string) => ({
  cookie: `${SESSION_COOKIE}=${sessionToken(role, email, undefined, CLINIC_A_ID)}`,
});
const portalRequest = (
  url: string,
  headers: Record<string, string>,
  method = 'GET',
) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/**
 * Data de nascimento `years` anos antes de hoje no fuso da aplicação (meia-noite
 * UTC do dia civil, como a tela grava): sem o fuso, o teste falharia entre 21h
 * e meia-noite de Brasília.
 */
const bornYearsAgo = (years: number, extraDays = 0) => {
  const today = zonedParts(new Date());
  return new Date(
    Date.UTC(today.year - years, today.month - 1, today.day + extraDays),
  ).toISOString();
};

describe('Feature: Termos em nome de quem assina e sem texto de preenchimento (#469)', () => {
  let guardiansRoute: typeof import('@/app/api/guardians/route');
  let patientsRoute: typeof import('@/app/api/patients/route');
  let accountsRoute: typeof import('@/app/api/accounts/route');
  let consentRoute: typeof import('@/app/api/portal/patient/consent/route');

  beforeAll(async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    guardiansRoute = await import('@/app/api/guardians/route');
    patientsRoute = await import('@/app/api/patients/route');
    accountsRoute = await import('@/app/api/accounts/route');
    consentRoute = await import('@/app/api/portal/patient/consent/route');
  });

  const setup = async (years: number, role: 'guardian' | 'patient') => {
    const guardianResponse = await guardiansRoute.POST(
      jsonRequest(
        '/api/guardians',
        'POST',
        {
          fullName: 'Rita Representante',
          relationship: 'mae',
          phone: '11999990000',
        },
        admin(),
      ),
    );
    const guardianId = (
      (await guardianResponse.json()) as Envelope<{ id: string }>
    ).data.id;
    const patientResponse = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        {
          fullName: 'Davi Paciente',
          phone: '11911112222',
          birthDate: bornYearsAgo(years),
          guardianId,
        },
        admin(),
      ),
    );
    const patientId = (
      (await patientResponse.json()) as Envelope<{ id: string }>
    ).data.id;
    const email = unique('termo');
    const account =
      role === 'guardian'
        ? { email, role, guardianId, guardianAuthorization: true }
        : { email, role, patientId };
    const created = await accountsRoute.POST(
      jsonRequest('/api/accounts', 'POST', account, admin()),
    );
    expect(created.status).toBe(200);
    return { patientId, headers: sessionCookie(role, email) };
  };

  const readConsent = async (
    headers: Record<string, string>,
    purpose = 'treatment',
  ) => {
    const response = await consentRoute.GET(
      portalRequest(`/api/portal/patient/consent?purpose=${purpose}`, headers),
    );
    return (
      (await response.json()) as Envelope<{
        consentText: string;
        accepted: boolean;
      }>
    ).data;
  };

  it('Dado menor, Quando a mãe lê o termo, Então o texto está em nome do representante legal', async () => {
    const { headers } = await setup(9, 'guardian');

    for (const purpose of ['treatment', 'image']) {
      const { consentText } = await readConsent(headers, purpose);
      expect(consentText).toContain('responsável legal do(a) paciente');
      expect(consentText).not.toContain('propostos a mim');
      expect(consentText).not.toContain('meu prontuário');
    }
  });

  it('Dado adulto, Quando ele lê o termo, Então o texto segue em primeira pessoa', async () => {
    const { headers } = await setup(40, 'patient');

    const { consentText } = await readConsent(headers);

    expect(consentText).toContain('Declaro que fui informado(a)');
  });

  it('Dado clínica sem responsável técnico nem encarregado nomeado, Quando ler o termo, Então não imprime texto de preenchimento', async () => {
    const { headers } = await setup(40, 'patient');

    for (const purpose of ['treatment', 'image']) {
      const { consentText } = await readConsent(headers, purpose);
      expect(consentText).not.toContain('Responsável técnico');
      expect(consentText).not.toContain('responsável técnico da clínica');
      expect(consentText).not.toContain('Responsável pela privacidade');
      expect(consentText).toContain('Encarregado pelos dados: contato@');
    }
  });

  it('Dado aceite da mãe, Quando consultar, Então o registro guarda a versão e o hash do texto do representante e vale como aceito', async () => {
    const { patientId, headers } = await setup(9, 'guardian');

    const accepted = await consentRoute.POST(
      portalRequest(
        '/api/portal/patient/consent?purpose=treatment',
        headers,
        'POST',
      ),
    );
    expect(accepted.status).toBe(200);

    const { consentRecords } = await getRepositories(clinicScope(CLINIC_A_ID));
    const [record] = await consentRecords.findByPatientId(patientId);
    expect(record.textVersion).toBe('v2-representante');
    expect(record.textHash).toBe(hashConsentText(CONSENT_REPRESENTATIVE_TEXT));
    expect((await readConsent(headers)).accepted).toBe(true);
  });
});
