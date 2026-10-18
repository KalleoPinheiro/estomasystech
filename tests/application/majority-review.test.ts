import { describe, expect, it } from 'vitest';
import {
  keepGuardianAfterMajority,
  listMajorityReviews,
} from '@/application/guardians/majority-review';
import { UserAccount } from '@/domain/auth/user-account';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { PartnerShareConsent } from '@/domain/consent/partner-share-consent';
import { Guardian } from '@/domain/guardian/guardian';
import { Patient } from '@/domain/patient/patient';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import {
  InMemoryConsentRecordRepository,
  InMemoryPartnerShareConsentRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import { InMemoryUserAccountRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';

const NOW = new Date('2026-10-18T15:00:00Z');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function setup() {
  const repos = {
    userAccounts: new InMemoryUserAccountRepository(),
    patients: new InMemoryPatientRepository(),
    guardians: new InMemoryGuardianRepository(),
    consentRecords: new InMemoryConsentRecordRepository(),
    partnerShareConsents: new InMemoryPartnerShareConsentRepository(),
  };
  const guardian = Guardian.create({
    fullName: 'Paula Mãe',
    relationship: 'mae',
    phone: '11999990000',
  });
  await repos.guardians.save(guardian);
  await repos.userAccounts.save(
    UserAccount.create({
      email: 'paula@x.com',
      passwordHash: UNSET_PASSWORD_HASH,
      role: 'guardian',
      clinicId: 'c-1',
      guardianId: guardian.id,
    }),
  );
  const patient = (fullName: string, birth: string | null, extra = {}) =>
    Patient.create({
      fullName,
      phone: '11999990000',
      birthDate: birth ? day(birth) : null,
      guardianId: guardian.id,
      ...extra,
    });
  return { repos, guardian, patient };
}

describe('Feature: aviso de maioridade (#372)', () => {
  it('lista só quem fez 18, sem conta própria, sem marca e com o acesso aberto', async () => {
    const { repos, patient } = await setup();
    const adult = patient('Ana Adulta', '2008-10-18');
    const minor = patient('Bruno Menor', '2008-10-19');
    const noBirth = patient('Carla Sem Data', null);
    const withAccount = patient('Davi Com Conta', '2000-01-01');
    const reviewed = patient(
      'Eva Mantida',
      '2000-01-01',
    ).markMajorityReviewed();
    const revoked = patient(
      'Fábio Encerrou',
      '2000-01-01',
    ).revokeGuardianPortalAccess();
    for (const p of [adult, minor, noBirth, withAccount, reviewed, revoked]) {
      await repos.patients.save(p);
    }
    await repos.userAccounts.save(
      UserAccount.create({
        email: 'davi@x.com',
        passwordHash: UNSET_PASSWORD_HASH,
        role: 'patient',
        clinicId: 'c-1',
        patientId: withAccount.id,
      }),
    );

    const items = await listMajorityReviews(repos, NOW);

    expect(items.map((item) => item.patient.fullName)).toEqual(['Ana Adulta']);
    expect(items[0]).toMatchObject({
      guardianName: 'Paula Mãe',
      guardianRelationship: 'mae',
      awaitingTransfer: true,
      representativeConsentExpiresOn: null,
      representativeConsentExpired: false,
    });
  });

  it('lista o adulto com aceite do representante vigente, com o prazo de 90 dias (#375)', async () => {
    const { repos, guardian, patient } = await setup();
    const signer = { guardianId: guardian.id, relationship: 'mae' };
    // Conta própria: não aguarda transferência, mas o aceite ainda é da mãe.
    const within = patient('Ana Dentro', '2008-09-01');
    const expired = patient('Bia Vencida', '2008-01-01');
    const ownName = patient('Caio Assinou', '2008-01-01');
    const minor = patient('Duda Menor', '2010-01-01');
    for (const p of [within, expired, ownName, minor]) {
      await repos.patients.save(p);
      await repos.userAccounts.save(
        UserAccount.create({
          email: `${p.id}@x.com`,
          passwordHash: UNSET_PASSWORD_HASH,
          role: 'patient',
          clinicId: 'c-1',
          patientId: p.id,
        }),
      );
      await repos.consentRecords.save(
        ConsentRecord.create({
          patientId: p.id,
          consentText: 'termo',
          textVersion: 'v1',
          signer,
        }),
      );
    }
    await repos.consentRecords.save(
      ConsentRecord.restore({
        id: 'own-name',
        patientId: ownName.id,
        kind: 'accept',
        textHash: 'h',
        textVersion: 'v1',
        ipAddress: null,
        acceptedAt: new Date(Date.now() + 1000),
      }),
    );
    await repos.partnerShareConsents.save(
      PartnerShareConsent.accept({
        patientId: within.id,
        partnerId: 'p-1',
        consentText: 'parceiro',
        textVersion: 'v1',
        ipAddress: null,
        signer,
      }),
    );

    const items = await listMajorityReviews(repos, NOW);

    expect(
      items.map((item) => [
        item.patient.fullName,
        item.awaitingTransfer,
        item.representativeConsentExpiresOn?.toISOString().slice(0, 10),
        item.representativeConsentExpired,
      ]),
    ).toEqual([
      ['Ana Dentro', false, '2026-11-30', false],
      ['Bia Vencida', false, '2026-04-01', true],
    ]);
    expect(items[0]).toMatchObject({
      guardianName: 'Paula Mãe',
      guardianRelationship: 'mae',
    });
  });

  it('sem conta de responsável ativa, a lista é vazia', async () => {
    const { repos, patient } = await setup();
    const [account] = await repos.userAccounts.findByRole('guardian');
    await repos.userAccounts.save(account.deactivate());
    await repos.patients.save(patient('Ana Adulta', '2000-01-01'));
    expect(await listMajorityReviews(repos, NOW)).toEqual([]);
  });

  it('manter com o responsável grava a trilha antes e recusa menor ou sem responsável', async () => {
    const { repos, patient } = await setup();
    const adult = patient('Ana Adulta', '2000-01-01');
    const minor = patient('Bruno Menor', '2015-01-01');
    const loose = Patient.create({
      fullName: 'Sem Responsável',
      phone: '11999990000',
      birthDate: day('2000-01-01'),
    });
    for (const p of [adult, minor, loose]) await repos.patients.save(p);
    const calls: string[] = [];

    const kept = await keepGuardianAfterMajority(
      repos,
      adult.id,
      async () => {
        calls.push('audit');
      },
      NOW,
    );
    expect(kept.majorityReviewedAt).toEqual(NOW);
    expect(calls).toEqual(['audit']);
    expect(
      (await repos.patients.findById(adult.id))?.majorityReviewedAt,
    ).toEqual(NOW);

    await expect(
      keepGuardianAfterMajority(repos, minor.id, async () => {}, NOW),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      keepGuardianAfterMajority(repos, loose.id, async () => {}, NOW),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('se a trilha falha, nada muda', async () => {
    const { repos, patient } = await setup();
    const adult = patient('Ana Adulta', '2000-01-01');
    await repos.patients.save(adult);
    await expect(
      keepGuardianAfterMajority(
        repos,
        adult.id,
        async () => {
          throw new Error('trilha fora');
        },
        NOW,
      ),
    ).rejects.toThrow('trilha fora');
    expect(
      (await repos.patients.findById(adult.id))?.majorityReviewedAt,
    ).toBeNull();
  });
});
