import { describe, expect, it } from 'vitest';
import { listMajorityReviews } from '@/application/guardians/majority-review';
import { UserAccount } from '@/domain/auth/user-account';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { Patient } from '@/domain/patient/patient';
import {
  InMemoryConsentRecordRepository,
  InMemoryPartnerShareConsentRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import { InMemoryUserAccountRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';

const NOW = new Date('2026-10-18T15:00:00Z');
const AT = new Date('2026-09-01T12:00:00Z');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const repos = () => ({
  userAccounts: new InMemoryUserAccountRepository(),
  patients: new InMemoryPatientRepository(),
  guardians: new InMemoryGuardianRepository(),
  consentRecords: new InMemoryConsentRecordRepository(),
  partnerShareConsents: new InMemoryPartnerShareConsentRepository(),
});

const termo = (
  patientId: string,
  kind: 'accept' | 'revoke',
  signer: { guardianId: string; relationship: string } | null,
) =>
  ConsentRecord.restore({
    id: `${patientId}-${kind}`,
    patientId,
    kind,
    purpose: 'treatment',
    textHash: kind === 'accept' ? 'hash' : '',
    textVersion: kind === 'accept' ? 'v1' : null,
    controllerSnapshot: null,
    ipAddress: null,
    acceptedAt: AT,
    signerGuardianId: signer?.guardianId ?? null,
    signerRelationship: signer?.relationship ?? null,
  });

describe('Feature: Aviso de maioridade com histórico de consentimento (#375)', () => {
  it.each([
    ['aceite gravado antes da revogação', ['accept', 'revoke'] as const],
    ['revogação gravada antes do aceite', ['revoke', 'accept'] as const],
  ])(
    'Dado %s no mesmo instante, Quando listar, Então o aceite do representante não conta mais',
    async (_nome, ordem) => {
      const r = repos();
      const adulto = Patient.create({
        fullName: 'Ana Adulta',
        phone: '11999990000',
        birthDate: day('2008-09-01'),
      });
      await r.patients.save(adulto);
      const signer = { guardianId: 'resp-1', relationship: 'mae' };
      for (const kind of ordem) {
        await r.consentRecords.save(
          termo(adulto.id, kind, kind === 'accept' ? signer : null),
        );
      }

      expect(await listMajorityReviews(r, NOW)).toEqual([]);
    },
  );

  it('Dado aceite do representante cujo cadastro de responsável sumiu, Quando listar, Então mostra o parentesco gravado no aceite e nome vazio', async () => {
    const r = repos();
    const adulto = Patient.create({
      fullName: 'Ana Adulta',
      phone: '11999990000',
      birthDate: day('2008-09-01'),
    });
    await r.patients.save(adulto);
    await r.consentRecords.save(
      ConsentRecord.create({
        patientId: adulto.id,
        consentText: 'termo',
        textVersion: 'v1',
        signer: { guardianId: 'sumido', relationship: 'tio' },
      }),
    );

    const [item] = await listMajorityReviews(r, NOW);

    expect(item).toMatchObject({
      guardianName: '',
      guardianRelationship: 'tio',
      awaitingTransfer: false,
    });
  });

  it('Dado adulto aguardando transferência cujo responsável não tem cadastro, Quando listar, Então nome e parentesco saem vazios', async () => {
    const r = repos();
    await r.userAccounts.save(
      UserAccount.create({
        email: 'resp@x.com',
        passwordHash: UNSET_PASSWORD_HASH,
        role: 'guardian',
        clinicId: 'c-1',
        guardianId: 'resp-sem-cadastro',
      }),
    );
    await r.patients.save(
      Patient.create({
        fullName: 'Bia Adulta',
        phone: '11999990000',
        birthDate: day('2000-01-01'),
        guardianId: 'resp-sem-cadastro',
      }),
    );

    const [item] = await listMajorityReviews(r, NOW);

    expect(item).toMatchObject({
      guardianName: '',
      guardianRelationship: '',
      awaitingTransfer: true,
    });
  });
});
