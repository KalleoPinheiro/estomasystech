import { describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { PartnerShareConsent } from '@/domain/consent/partner-share-consent';
import { Guardian } from '@/domain/guardian/guardian';
import { Partner } from '@/domain/partner/partner';
import { Patient } from '@/domain/patient/patient';
import { getRepositories } from '@/infrastructure/container';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import type { PatientPortalSession } from '@/lib/auth/require-session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CONSENT_TEXT, CONSENT_TEXT_VERSION } from '@/lib/consent-text';
import { PARTNER_SHARE_CONSENT } from '@/lib/partner-share-consent-text';
import {
  loadConsentStatus,
  loadPartnerPortal,
  loadPatientPortalView,
  loadRepresentedPatients,
} from '@/lib/server/data/portal';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  completeClinicRegistration,
  ensureTestClinics,
} from '../../support/clinics';
import { linkPortalAccount } from '../../support/portal-account';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const yearsAgo = (years: number) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date;
};

const unique = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

async function guardianWith(
  relationship: 'mae' | 'conjuge',
  patients: { fullName: string; birthDate?: Date }[],
  clinicId: string = CLINIC_A_ID,
) {
  const repos = await getRepositories(clinicScope(clinicId));
  const guardian = Guardian.create({
    fullName: unique('Responsável'),
    relationship,
    phone: '11999990000',
    email: null,
  });
  await repos.guardians.save(guardian);
  const email = `${unique('resp')}@x.com`;
  await repos.userAccounts.save(
    UserAccount.create({
      email,
      passwordHash: UNSET_PASSWORD_HASH,
      role: 'guardian',
      clinicId,
      guardianId: guardian.id,
    }),
  );
  const saved: Patient[] = [];
  for (const input of patients) {
    const patient = Patient.create({
      fullName: input.fullName,
      email: `${unique('pac')}@x.com`,
      phone: '11988880000',
      birthDate: input.birthDate ?? yearsAgo(8),
      guardianId: guardian.id,
    });
    await repos.patients.save(patient);
    saved.push(patient);
  }
  const session = (actingPatientId: string | null) =>
    ({
      role: 'guardian',
      subject: email,
      clinicId,
      actingPatientId,
    }) as unknown as PatientPortalSession;
  return { repos, saved, session, email };
}

describe('Feature: regras de acesso do portal lidas no servidor (#614)', () => {
  it('Dado responsável de menor, Quando monta a tela, Então lê pedidos do titular e consentimento do parceiro em nome do menor', async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    const { saved, session } = await guardianWith('mae', [
      { fullName: 'Menino Representado' },
    ]);

    const view = await loadPatientPortalView(session(saved[0].id));

    expect(view.data.actingFor?.patientId).toBe(saved[0].id);
    expect(view.consent?.canSign).toBe(true);
    expect(view.dataRequests).toEqual([]);
    expect(view.partnerConsent).toBeNull();
  });

  it('Dado responsável de menor e a leitura do termo falhando, Quando monta a tela, Então a tela abre sem o termo e sem os blocos de quem decide', async () => {
    await ensureTestClinics();
    // A clínica B não completou o cadastro: sem controlador, o termo não carrega.
    const { saved, session } = await guardianWith(
      'mae',
      [{ fullName: 'Menor Sem Termo' }],
      CLINIC_B_ID,
    );

    const view = await loadPatientPortalView(session(saved[0].id));

    expect(view.consent).toBeNull();
    expect(view.imageConsent).toBeNull();
    expect(view.data.actingFor?.patientId).toBe(saved[0].id);
    expect(view.dataRequests).toBeNull();
    expect(view.partnerConsent).toBeNull();
  });

  it('Dado responsável de adulto, Quando monta a tela, Então os blocos do titular ficam nulos e não são lidos', async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    const { saved, session } = await guardianWith('conjuge', [
      { fullName: 'Adulto Representado', birthDate: yearsAgo(40) },
    ]);

    const view = await loadPatientPortalView(session(saved[0].id));

    expect(view.consent?.canSign).toBe(false);
    expect(view.dataRequests).toBeNull();
    expect(view.partnerConsent).toBeNull();
  });

  it('Dado o próprio paciente adulto, Quando monta a tela, Então lê os blocos do titular mesmo sem ser representante', async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    const patient = Patient.create({
      fullName: 'Titular Adulto',
      email: `${unique('tit')}@x.com`,
      phone: '11977770000',
      birthDate: yearsAgo(35),
    });
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    await repos.patients.save(patient);
    await linkPortalAccount({
      role: 'patient',
      email: patient.email as string,
      recordId: patient.id,
      clinicId: CLINIC_A_ID,
    });

    const view = await loadPatientPortalView({
      role: 'patient',
      subject: patient.email,
      clinicId: CLINIC_A_ID,
      actingPatientId: null,
    } as unknown as PatientPortalSession);

    expect(view.data.actingFor).toBeNull();
    expect(view.dataRequests).toEqual([]);
  });

  it('Dado responsável de dois menores, Quando o cookie escolhe um, Então o escolhido vale e o outro não', async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    const { saved, session } = await guardianWith('mae', [
      { fullName: 'Primeira Filha' },
      { fullName: 'Segundo Filho' },
    ]);
    const patients = saved.map((p) => ({ id: p.id, fullName: p.fullName }));

    const second = await loadRepresentedPatients(session(saved[1].id));
    const first = await loadRepresentedPatients(session(saved[0].id));

    expect(second.selectedPatientId).toBe(saved[1].id);
    expect(first.selectedPatientId).toBe(saved[0].id);
    expect(second.patients).toEqual(expect.arrayContaining(patients));
    expect(second.patients).toHaveLength(2);
  });

  it('Dado responsável de dois menores sem escolha, Quando lista os representados, Então nenhum vale como escolhido', async () => {
    await ensureTestClinics();
    const { session } = await guardianWith('mae', [
      { fullName: 'Irmã Um' },
      { fullName: 'Irmão Dois' },
    ]);

    const none = await loadRepresentedPatients(session(null));
    const stranger = await loadRepresentedPatients(session('outro-id'));

    expect(none.selectedPatientId).toBeNull();
    expect(stranger.selectedPatientId).toBeNull();
  });

  it('Dado responsável de um só menor, Quando o cookie aponta outro paciente, Então o único representado vale', async () => {
    await ensureTestClinics();
    const { saved, session } = await guardianWith('mae', [
      { fullName: 'Filho Único' },
    ]);

    const represented = await loadRepresentedPatients(session('outro-id'));

    expect(represented.selectedPatientId).toBe(saved[0].id);
  });

  it('Dado parceiro com dois indicados e um consentimento, Quando lê o portal, Então a trilha LGPD registra as duas contagens', async () => {
    await ensureTestClinics();
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const partner = Partner.create({
      fullName: unique('Dra. Auditada'),
      email: `${unique('parc')}@x.com`,
      phone: '11966660000',
    });
    await repos.partners.save(partner);
    await linkPortalAccount({
      role: 'partner',
      email: partner.email as string,
      recordId: partner.id,
      clinicId: CLINIC_A_ID,
    });
    const referred: Patient[] = [];
    for (const name of ['Indicado Um', 'Indicado Dois']) {
      const patient = Patient.create({
        fullName: name,
        email: `${unique('ind')}@x.com`,
        phone: '11955550000',
        referredByPartnerId: partner.id,
      });
      await repos.patients.save(patient);
      referred.push(patient);
    }
    await repos.partnerShareConsents.save(
      PartnerShareConsent.accept({
        patientId: referred[0].id,
        partnerId: partner.id,
        consentText: PARTNER_SHARE_CONSENT.text,
        textVersion: PARTNER_SHARE_CONSENT.version,
      }),
    );

    await loadPartnerPortal({
      role: 'partner',
      subject: partner.email,
      clinicId: CLINIC_A_ID,
    } as never);

    await vi.waitFor(async () => {
      const events = await repos.auditEvents.findAll({});
      const trail = events.find(
        (e) =>
          e.resourceType === 'portal-partner' && e.resourceId === partner.id,
      );
      expect(trail?.action).toBe('read');
      expect(trail?.detail).toBe(
        'pacientes indicados: 2; com consentimento: 1',
      );
    });
  });

  it('Dado aceite do termo, Quando lê o status, Então traz a versão e a data do último aceite', async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    const patient = Patient.create({
      fullName: 'Aceitou Termo',
      email: `${unique('ace')}@x.com`,
      phone: '11944440000',
      birthDate: yearsAgo(30),
    });
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    await repos.patients.save(patient);
    await linkPortalAccount({
      role: 'patient',
      email: patient.email as string,
      recordId: patient.id,
      clinicId: CLINIC_A_ID,
    });
    await repos.consentRecords.save(
      ConsentRecord.create({
        patientId: patient.id,
        consentText: CONSENT_TEXT,
        textVersion: CONSENT_TEXT_VERSION,
      }),
    );

    const status = await loadConsentStatus(
      {
        role: 'patient',
        subject: patient.email,
        clinicId: CLINIC_A_ID,
        actingPatientId: null,
      } as unknown as PatientPortalSession,
      'treatment',
    );

    expect(status.accepted).toBe(true);
    expect(status.textVersion).toBe(CONSENT_TEXT_VERSION);
    expect(status.acceptedAt).not.toBeNull();
    expect(status.revokedAt).toBeNull();
    expect(status.signedByRelationship).toBeNull();
  });
});
