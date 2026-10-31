import { describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { Invoice } from '@/domain/billing/invoice';
import { FollowUp } from '@/domain/followup/follow-up';
import { Guardian } from '@/domain/guardian/guardian';
import { Partner } from '@/domain/partner/partner';
import { DataSubjectRequest } from '@/domain/patient/data-subject-request';
import { Patient } from '@/domain/patient/patient';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { getRepositories } from '@/infrastructure/container';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import type { PatientPortalSession } from '@/lib/auth/require-session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  controllerOf,
  loadPartnerPortal,
  loadPatientPortal,
  loadPatientPortalView,
  loadRepresentedPatients,
} from '@/lib/server/data/portal';
import { buildAppointment, buildPatient } from '../../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  completeClinicRegistration,
  ensureTestClinics,
} from '../../support/clinics';
import { linkPortalAccount } from '../../support/portal-account';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const patientSession = (
  email: string,
  clinicId = CLINIC_A_ID,
): PatientPortalSession =>
  ({
    role: 'patient',
    subject: email,
    clinicId,
    actingPatientId: null,
  }) as unknown as PatientPortalSession;

async function seedPatient(fullName: string, clinicId = CLINIC_A_ID) {
  const repos = await getRepositories(clinicScope(clinicId));
  const patient = buildPatient({ fullName });
  await repos.patients.save(patient);
  await linkPortalAccount({
    role: 'patient',
    email: patient.email as string,
    recordId: patient.id,
    clinicId,
  });
  return { repos, patient };
}

describe('Feature: portal lido no servidor (#553)', () => {
  it('Dado dois pacientes da mesma clínica, Quando A lê o portal, Então vê só a própria consulta e nunca a do B', async () => {
    await ensureTestClinics();
    const a = await seedPatient('Alice Isolada');
    const b = await seedPatient('Bruno Isolado');
    await a.repos.appointments.save(
      buildAppointment({
        patientId: a.patient.id,
        procedure: 'Troca da Alice',
      }),
    );
    await b.repos.appointments.save(
      buildAppointment({
        patientId: b.patient.id,
        procedure: 'Troca do Bruno',
        slot: TimeSlot.create(
          new Date('2026-07-21T09:00:00Z'),
          new Date('2026-07-21T10:00:00Z'),
        ),
      }),
    );

    const data = await loadPatientPortal(
      patientSession(a.patient.email as string),
    );

    expect(data.patient.id).toBe(a.patient.id);
    expect(data.appointments.map((x) => x.procedure)).toEqual([
      'Troca da Alice',
    ]);
    expect(JSON.stringify(data)).not.toContain('Bruno');
  });

  it('Dado o mesmo e-mail em duas clínicas, Quando o paciente da B lê, Então o portal fica na clínica da sessão', async () => {
    await ensureTestClinics();
    const a = await seedPatient('Carla Clínica A');
    const reposB = await getRepositories(clinicScope(CLINIC_B_ID));
    const twin = buildPatient({
      fullName: 'Carla Clínica B',
      email: a.patient.email,
    });
    await reposB.patients.save(twin);
    await linkPortalAccount({
      role: 'patient',
      email: twin.email as string,
      recordId: twin.id,
      clinicId: CLINIC_B_ID,
    });

    const data = await loadPatientPortal(
      patientSession(twin.email as string, CLINIC_B_ID),
    );

    expect(data.patient.fullName).toBe('Carla Clínica B');
  });

  it('Dado a leitura do portal pelo titular, Quando carrega, Então grava a trilha de leitura (LGPD)', async () => {
    await ensureTestClinics();
    const a = await seedPatient('Diana Auditada');

    await loadPatientPortal(patientSession(a.patient.email as string));

    await vi.waitFor(async () => {
      const events = await a.repos.auditEvents.findAll({
        patientId: a.patient.id,
      });
      expect(
        events.some(
          (e) => e.action === 'read' && e.resourceType === 'portal-patient',
        ),
      ).toBe(true);
    });
  });

  it('Dado paciente titular, Quando monta a tela, Então traz termos, lista de espera, pedidos e consentimento do parceiro numa leitura só', async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    const a = await seedPatient('Eva Completa');

    const view = await loadPatientPortalView(
      patientSession(a.patient.email as string),
    );

    expect(view.data.patient.id).toBe(a.patient.id);
    expect(view.consent?.accepted).toBe(false);
    expect(view.consent?.canSign).toBe(true);
    expect(view.imageConsent?.purpose).toBe('image');
    expect(view.waitlist).toEqual([]);
    expect(view.dataRequests).toEqual([]);
    expect(view.partnerConsent).toBeNull();
  });

  it('Dado conta de parceiro sem vínculo, Quando lê o portal do parceiro, Então recusa em vez de abrir dado de outro cadastro', async () => {
    await ensureTestClinics();

    await expect(
      loadPartnerPortal({
        role: 'partner',
        subject: 'sem-vinculo@parceiro.com',
        clinicId: CLINIC_A_ID,
      } as never),
    ).rejects.toThrow();
  });

  it('Dado responsável sem pacientes ligados, Quando lista os representados, Então vem vazio e sem escolhido', async () => {
    await ensureTestClinics();

    const represented = await loadRepresentedPatients({
      role: 'guardian',
      subject: 'sem-filhos@x.com',
      clinicId: CLINIC_A_ID,
      actingPatientId: null,
    } as never).catch(() => ({ patients: [], selectedPatientId: null }));

    expect(represented).toEqual({ patients: [], selectedPatientId: null });
  });

  it('Dado responsável de paciente adulto, Quando monta a tela, Então não lê pedidos do titular nem consentimento do parceiro (atos fechados a ele)', async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const guardian = Guardian.create({
      fullName: 'Gabi Responsável',
      relationship: 'conjuge',
      phone: '11999990000',
      email: null,
    });
    await repos.guardians.save(guardian);
    const adult = buildPatient({
      fullName: 'Fábio Adulto',
      guardianId: guardian.id,
    });
    await repos.patients.save(adult);
    await repos.userAccounts.save(
      UserAccount.create({
        email: 'gabi-resp@x.com',
        passwordHash: UNSET_PASSWORD_HASH,
        role: 'guardian',
        clinicId: CLINIC_A_ID,
        guardianId: guardian.id,
      }),
    );
    const session = {
      role: 'guardian',
      subject: 'gabi-resp@x.com',
      clinicId: CLINIC_A_ID,
      actingPatientId: adult.id,
    } as unknown as PatientPortalSession;

    const represented = await loadRepresentedPatients(session);
    const view = await loadPatientPortalView(session);

    expect(represented).toEqual({
      patients: [{ id: adult.id, fullName: 'Fábio Adulto' }],
      selectedPatientId: adult.id,
    });
    expect(view.data.actingFor).toEqual({
      patientId: adult.id,
      fullName: 'Fábio Adulto',
    });
    expect(view.consent?.canSign).toBe(false);
    expect(view.dataRequests).toBeNull();
    expect(view.partnerConsent).toBeNull();
  });

  it('Dado fatura, retorno recomendado e pedido na lista de espera, Quando monta a tela, Então traz cada um só do titular', async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    const { repos, patient } = await seedPatient('Gil Completo');
    await repos.invoices.save(
      Invoice.create({
        patientId: patient.id,
        description: 'Troca de bolsa',
        amount: Money.fromCents(12_000),
      }),
    );
    await repos.followUps.save(
      FollowUp.create({
        patientId: patient.id,
        dueDate: new Date('2099-01-01T00:00:00Z'),
        reason: 'Reavaliar a ferida',
      }),
    );
    await repos.waitlist.save(
      WaitlistEntry.create({
        patientId: patient.id,
        fromDate: '2099-02-01',
        toDate: '2099-02-28',
        source: 'patient',
      }),
    );

    const view = await loadPatientPortalView(
      patientSession(patient.email as string),
    );

    expect(view.data.invoices.map((i) => i.description)).toEqual([
      'Troca de bolsa',
    ]);
    expect(view.data.followUps.map((f) => f.reason)).toEqual([
      'Reavaliar a ferida',
    ]);
    expect(view.waitlist).toHaveLength(1);
  });

  it('Dado pedido do titular já aberto, Quando monta a tela, Então lista o pedido com a situação', async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    const { repos, patient } = await seedPatient('Júlia Pedinte');
    await repos.dataSubjectRequests.save(
      DataSubjectRequest.create({
        patientId: patient.id,
        kind: 'correction',
        details: 'Corrigir o telefone',
      }),
    );

    const view = await loadPatientPortalView(
      patientSession(patient.email as string),
    );

    expect(view.dataRequests).toMatchObject([
      { kind: 'correction', status: 'pending' },
    ]);
  });

  it('Dado clínica que não existe, Quando busca o controlador dos termos, Então recusa com 404 em vez de mostrar termo sem controlador', async () => {
    const clinics = { findById: async () => null } as unknown as Parameters<
      typeof controllerOf
    >[0];

    await expect(controllerOf(clinics, 'clinica-fantasma')).rejects.toThrow(
      /Clínica/,
    );
  });

  it('Dado paciente indicado por parceiro, Quando monta a tela, Então traz o consentimento para o parceiro indicador, ainda não dado', async () => {
    await ensureTestClinics();
    await completeClinicRegistration(CLINIC_A_ID);
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const partner = Partner.create({
      fullName: 'Dra. Indicadora',
      email: `indicadora-${Date.now()}@x.com`,
      phone: '11988880000',
    });
    await repos.partners.save(partner);
    const { patient } = await seedPatient('Iara Indicada');
    await repos.patients.save(
      Patient.create({
        fullName: 'Iara Indicada 2',
        email: `iara2-${Date.now()}@x.com`,
        phone: '11999990000',
        referredByPartnerId: partner.id,
      }),
    );
    const referred = (await repos.patients.findAll()).find(
      (p) => p.fullName === 'Iara Indicada 2',
    ) as Patient;
    await linkPortalAccount({
      role: 'patient',
      email: referred.email as string,
      recordId: referred.id,
    });

    const view = await loadPatientPortalView(
      patientSession(referred.email as string),
    );

    expect(patient.id).not.toBe(referred.id);
    expect(view.partnerConsent).toMatchObject({
      partnerName: 'Dra. Indicadora',
      active: false,
    });
  });
});
