import { describe, expect, it } from 'vitest';
import {
  ADULT_CONSENT_ONLY_MESSAGE,
  ADULT_TITULAR_ONLY_MESSAGE,
  consentSignerFor,
  GUARDIAN_ACCESS_RESOURCE,
  GUARDIAN_PICK_PATIENT_MESSAGE,
  listRepresentablePatients,
  MINOR_PATIENT_PORTAL_MESSAGE,
  type PortalSessionIdentity,
  resolveConsentSigner,
  resolvePortalPartner,
  resolvePortalPatient,
} from '@/application/portal/portal-identity';
import {
  Guardian,
  type GuardianRelationship,
} from '@/domain/guardian/guardian';
import { Partner } from '@/domain/partner/partner';
import type { Patient } from '@/domain/patient/patient';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '@/domain/shared/errors';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import { InMemoryUserAccountRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import { InMemoryPartnerRepository } from '@/infrastructure/persistence/in-memory/in-memory-partner-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { buildPatient, buildUserAccount } from '../../support/builders';

const yearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
};

function world() {
  const repos = {
    userAccounts: new InMemoryUserAccountRepository(),
    patients: new InMemoryPatientRepository(),
    guardians: new InMemoryGuardianRepository(),
    auditEvents: new InMemoryAuditEventRepository(),
  };
  const partners = new InMemoryPartnerRepository();
  return { repos, partners };
}

const guardianOf = (relationship: GuardianRelationship) =>
  Guardian.create({
    fullName: 'Responsável Teste',
    relationship,
    phone: '+5511999990000',
  });

async function guardianWorld(
  relationship: GuardianRelationship,
  patients: Patient[],
  afterLink: (patient: Patient) => Patient = (patient) => patient,
) {
  const w = world();
  const guardian = guardianOf(relationship);
  await w.repos.guardians.save(guardian);
  const linked = patients.map((p) =>
    afterLink(p.update({ guardianId: guardian.id })),
  );
  for (const p of linked) await w.repos.patients.save(p);
  const account = buildUserAccount({
    email: 'resp@portal.test',
    role: 'guardian',
    guardianId: guardian.id,
    clinicId: 'clinic-1',
  });
  await w.repos.userAccounts.save(account);
  const session: PortalSessionIdentity = {
    subject: 'resp@portal.test',
    role: 'guardian',
    clinicId: 'clinic-1',
  };
  return { ...w, guardian, linked, account, session };
}

describe('Feature: Identidade do portal (mutação, #406)', () => {
  it('Dado as mensagens do portal, Então o texto é o que o usuário lê', () => {
    expect(GUARDIAN_PICK_PATIENT_MESSAGE).toBe(
      'Escolha o paciente que você está representando.',
    );
    expect(MINOR_PATIENT_PORTAL_MESSAGE).toMatch(
      /^Paciente menor de 18 anos não tem acesso próprio ao portal/,
    );
    expect(ADULT_CONSENT_ONLY_MESSAGE).toMatch(
      /^O aceite dos termos é do próprio paciente/,
    );
    expect(ADULT_TITULAR_ONLY_MESSAGE).toMatch(
      /^Este pedido é do próprio paciente/,
    );
  });

  describe('Cenário: paciente com conta própria', () => {
    it('Dado conta ativa vinculada a paciente adulto, Então resolve o paciente', async () => {
      const w = world();
      const patient = buildPatient({ birthDate: yearsAgo(40) });
      await w.repos.patients.save(patient);
      await w.repos.userAccounts.save(
        buildUserAccount({
          email: 'pac@portal.test',
          role: 'patient',
          patientId: patient.id,
        }),
      );
      const got = await resolvePortalPatient(w.repos, {
        subject: 'pac@portal.test',
        role: 'patient',
      });
      expect(got.id).toBe(patient.id);
    });

    it('Dado conta desativada, Então 404', async () => {
      const w = world();
      const patient = buildPatient({ birthDate: yearsAgo(40) });
      await w.repos.patients.save(patient);
      await w.repos.userAccounts.save(
        buildUserAccount({
          email: 'pac@portal.test',
          role: 'patient',
          patientId: patient.id,
        }).deactivate(),
      );
      await expect(
        resolvePortalPatient(w.repos, {
          subject: 'pac@portal.test',
          role: 'patient',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('Dado conta com papel diferente do da sessão, Então 404', async () => {
      const w = world();
      const patient = buildPatient({ birthDate: yearsAgo(40) });
      await w.repos.patients.save(patient);
      await w.repos.userAccounts.save(
        buildUserAccount({
          email: 'pac@portal.test',
          role: 'patient',
          patientId: patient.id,
        }),
      );
      await expect(
        resolvePortalPatient(w.repos, {
          subject: 'pac@portal.test',
          role: 'partner',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('Dado paciente inativo ou sem cadastro, Então 404 com o id da conta', async () => {
      const w = world();
      const inactive = buildPatient({ birthDate: yearsAgo(40) }).deactivate();
      await w.repos.patients.save(inactive);
      const account = buildUserAccount({
        email: 'pac@portal.test',
        role: 'patient',
        patientId: inactive.id,
      });
      await w.repos.userAccounts.save(account);
      const error = await resolvePortalPatient(w.repos, {
        subject: 'pac@portal.test',
        role: 'patient',
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).entityId).toBe(account.id);
      const semConta = await resolvePortalPatient(w.repos, {
        subject: 'ninguem@portal.test',
        role: 'patient',
      }).catch((e: unknown) => e);
      expect((semConta as NotFoundError).entityId).toBe('sem-conta');
    });

    it('Dado paciente menor com conta própria, Então 403 com a mensagem do menor', async () => {
      const w = world();
      const minor = buildPatient({ birthDate: yearsAgo(10) });
      await w.repos.patients.save(minor);
      await w.repos.userAccounts.save(
        buildUserAccount({
          email: 'pac@portal.test',
          role: 'patient',
          patientId: minor.id,
        }),
      );
      const error = await resolvePortalPatient(w.repos, {
        subject: 'pac@portal.test',
        role: 'patient',
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as Error).message).toBe(MINOR_PATIENT_PORTAL_MESSAGE);
    });
  });

  describe('Cenário: responsável', () => {
    it('Dado conta de responsável sem vínculo com cadastro, Então 404 com o id da conta', async () => {
      const w = world();
      const account = buildUserAccount({
        email: 'resp@portal.test',
        role: 'guardian',
      });
      await w.repos.userAccounts.save(account);
      const error = await listRepresentablePatients(w.repos, {
        subject: 'resp@portal.test',
        role: 'guardian',
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).entityId).toBe(account.id);
      const semConta = await listRepresentablePatients(w.repos, {
        subject: 'x@portal.test',
        role: 'guardian',
      }).catch((e: unknown) => e);
      expect((semConta as NotFoundError).entityId).toBe('sem-conta');
    });

    it('Dado conta de paciente tentando listar representados, Então 404', async () => {
      const w = world();
      await w.repos.userAccounts.save(
        buildUserAccount({
          email: 'p@portal.test',
          role: 'patient',
          guardianId: 'g1',
        }),
      );
      await expect(
        listRepresentablePatients(w.repos, {
          subject: 'p@portal.test',
          role: 'patient',
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('Dado mãe com um adulto, um menor, um inativo e um com acesso revogado, Então vê só adulto e menor ativos e não revogados', async () => {
      const adult = buildPatient({ birthDate: yearsAgo(40) });
      const minor = buildPatient({ birthDate: yearsAgo(8) });
      const inactive = buildPatient({ birthDate: yearsAgo(40) });
      const revoked = buildPatient({ birthDate: yearsAgo(40) });
      const g = await guardianWorld(
        'mae',
        [adult, minor, inactive, revoked],
        (p) => {
          if (p.id === inactive.id) return p.deactivate();
          if (p.id === revoked.id) return p.revokeGuardianPortalAccess();
          return p;
        },
      );
      const ids = (await listRepresentablePatients(g.repos, g.session))
        .map((p) => p.id)
        .sort();
      expect(ids).toEqual([adult.id, minor.id].sort());
    });

    it('Dado avó (sem tutela), Então não vê o menor mas vê o adulto', async () => {
      const adult = buildPatient({ birthDate: yearsAgo(40) });
      const minor = buildPatient({ birthDate: yearsAgo(8) });
      const g = await guardianWorld('avo', [adult, minor]);
      expect(
        (await listRepresentablePatients(g.repos, g.session)).map((p) => p.id),
      ).toEqual([adult.id]);
    });

    it('Dado responsável cujo cadastro sumiu, Então não representa menores', async () => {
      const minor = buildPatient({ birthDate: yearsAgo(8) });
      const adult = buildPatient({ birthDate: yearsAgo(40) });
      const g = await guardianWorld('mae', [minor, adult]);
      const orphan = buildUserAccount({
        email: 'orf@portal.test',
        role: 'guardian',
        guardianId: 'cadastro-inexistente',
        clinicId: 'clinic-1',
      });
      await g.repos.userAccounts.save(orphan);
      const linkedToMissing = minor.update({
        guardianId: 'cadastro-inexistente',
      });
      await g.repos.patients.save(linkedToMissing);
      const adultMissing = adult.update({ guardianId: 'cadastro-inexistente' });
      await g.repos.patients.save(adultMissing);
      const list = await listRepresentablePatients(g.repos, {
        subject: 'orf@portal.test',
        role: 'guardian',
      });
      expect(list.map((p) => p.id)).toEqual([adult.id]);
    });

    it('Dado um único representado, Quando resolve, Então devolve o paciente e grava a trilha de acesso', async () => {
      const only = buildPatient({ birthDate: yearsAgo(8) });
      const g = await guardianWorld('pai', [only]);
      const got = await resolvePortalPatient(g.repos, g.session);
      expect(got.id).toBe(only.id);
      const events = await g.repos.auditEvents.findAll();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        clinicId: 'clinic-1',
        actorRole: 'guardian',
        actorId: 'resp@portal.test',
        action: 'read',
        resourceType: GUARDIAN_ACCESS_RESOURCE,
        resourceId: only.id,
        patientId: only.id,
        detail: 'acesso do responsável em nome do paciente',
      });
    });

    it('Dado sessão sem clínica, Então a trilha usa a clínica da conta', async () => {
      const only = buildPatient({ birthDate: yearsAgo(8) });
      const g = await guardianWorld('pai', [only]);
      await resolvePortalPatient(g.repos, {
        subject: g.session.subject,
        role: 'guardian',
      });
      expect((await g.repos.auditEvents.findAll())[0]?.clinicId).toBe(
        'clinic-1',
      );
    });

    it('Dado dois representados, Quando o cookie escolhe um, Então resolve o escolhido', async () => {
      const a = buildPatient({ birthDate: yearsAgo(8) });
      const b = buildPatient({ birthDate: yearsAgo(6) });
      const g = await guardianWorld('mae', [a, b]);
      expect(
        (
          await resolvePortalPatient(g.repos, {
            ...g.session,
            actingPatientId: b.id,
          })
        ).id,
      ).toBe(b.id);
      expect(
        (
          await resolvePortalPatient(g.repos, {
            ...g.session,
            actingPatientId: a.id,
          })
        ).id,
      ).toBe(a.id);
    });

    it('Dado dois representados sem escolha, Então pede para escolher e não grava trilha', async () => {
      const a = buildPatient({ birthDate: yearsAgo(8) });
      const b = buildPatient({ birthDate: yearsAgo(6) });
      const g = await guardianWorld('mae', [a, b]);
      const error = await resolvePortalPatient(g.repos, g.session).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as Error).message).toBe(GUARDIAN_PICK_PATIENT_MESSAGE);
      expect(await g.repos.auditEvents.findAll()).toHaveLength(0);
    });

    it('Dado escolha de paciente que não é representado, Então 404 com um só representado ainda resolve o único', async () => {
      const a = buildPatient({ birthDate: yearsAgo(8) });
      const g = await guardianWorld('mae', [a]);
      const got = await resolvePortalPatient(g.repos, {
        ...g.session,
        actingPatientId: 'outro-paciente',
      });
      expect(got.id).toBe(a.id);
    });

    it('Dado nenhum representado, Então 404 com o id da conta', async () => {
      const g = await guardianWorld('mae', []);
      const error = await resolvePortalPatient(g.repos, g.session).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).entityId).toBe(g.account.id);
    });
  });

  describe('Cenário: quem assina os termos', () => {
    it('Dado paciente adulto com conta própria, Então assina por si (signer nulo)', async () => {
      const w = world();
      const adult = buildPatient({ birthDate: yearsAgo(40) });
      await w.repos.patients.save(adult);
      await w.repos.userAccounts.save(
        buildUserAccount({
          email: 'pac@portal.test',
          role: 'patient',
          patientId: adult.id,
        }),
      );
      const out = await resolveConsentSigner(w.repos, {
        subject: 'pac@portal.test',
        role: 'patient',
      });
      expect(out.patient.id).toBe(adult.id);
      expect(out.signer).toBeNull();
    });

    it('Dado mãe de menor, Então assina pelo menor com cadastro e parentesco', async () => {
      const minor = buildPatient({ birthDate: yearsAgo(8) });
      const g = await guardianWorld('mae', [minor]);
      const out = await resolveConsentSigner(g.repos, g.session);
      expect(out.signer).toEqual({
        guardianId: g.guardian.id,
        relationship: 'mae',
      });
    });

    it('Dado responsável de paciente adulto, Então 403 com a mensagem pedida', async () => {
      const adult = buildPatient({ birthDate: yearsAgo(40) });
      const g = await guardianWorld('mae', [adult]);
      const padrao = await resolveConsentSigner(g.repos, g.session).catch(
        (e: unknown) => e,
      );
      expect(padrao).toBeInstanceOf(ForbiddenError);
      expect((padrao as Error).message).toBe(ADULT_CONSENT_ONLY_MESSAGE);
      const outra = await resolveConsentSigner(
        g.repos,
        g.session,
        ADULT_TITULAR_ONLY_MESSAGE,
      ).catch((e: unknown) => e);
      expect((outra as Error).message).toBe(ADULT_TITULAR_ONLY_MESSAGE);
    });

    it('Dado responsável sem tutela (avó) de menor, Então 403', async () => {
      const g = await guardianWorld('avo', []);
      const minor = buildPatient({ birthDate: yearsAgo(8) }).update({
        guardianId: g.guardian.id,
      });
      await expect(
        consentSignerFor(g.repos, g.session, minor),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('Dado menor sem responsável cadastrado, Então 403', async () => {
      const w = world();
      const minor = buildPatient({ birthDate: yearsAgo(8) });
      await expect(
        consentSignerFor(w.repos, { subject: 'x', role: 'guardian' }, minor),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('Dado sessão que não é de responsável, Então não há signatário', async () => {
      const w = world();
      expect(
        await consentSignerFor(
          w.repos,
          { subject: 'x', role: 'patient' },
          buildPatient({ birthDate: yearsAgo(8) }),
        ),
      ).toBeNull();
    });
  });

  describe('Cenário: parceiro', () => {
    const partner = () =>
      Partner.create({
        fullName: 'Dr. Parceiro',
        email: 'dr@parceiro.test',
        phone: '+5511999990000',
      });

    it('Dado conta ativa de parceiro ativo, Então resolve', async () => {
      const w = world();
      const p = partner();
      await w.partners.save(p);
      await w.repos.userAccounts.save(
        buildUserAccount({
          email: 'dr@portal.test',
          role: 'partner',
          partnerId: p.id,
        }),
      );
      const got = await resolvePortalPartner(
        { userAccounts: w.repos.userAccounts, partners: w.partners },
        { subject: 'dr@portal.test', role: 'partner' },
      );
      expect(got.id).toBe(p.id);
    });

    it('Dado parceiro inativo ou conta sem vínculo, Então 404', async () => {
      const w = world();
      const p = partner().deactivate();
      await w.partners.save(p);
      const account = buildUserAccount({
        email: 'dr@portal.test',
        role: 'partner',
        partnerId: p.id,
      });
      await w.repos.userAccounts.save(account);
      const services = {
        userAccounts: w.repos.userAccounts,
        partners: w.partners,
      };
      const error = await resolvePortalPartner(services, {
        subject: 'dr@portal.test',
        role: 'partner',
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).entityId).toBe(account.id);
      const semConta = await resolvePortalPartner(services, {
        subject: 'x@portal.test',
        role: 'partner',
      }).catch((e: unknown) => e);
      expect((semConta as NotFoundError).entityId).toBe('sem-conta');
    });
  });
});
