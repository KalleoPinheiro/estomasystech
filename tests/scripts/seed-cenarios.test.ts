process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

import { describe, expect, it } from 'vitest';
import { ConsentRecord } from '@/domain/consent/consent-record';
import { getRepositories } from '@/infrastructure/container';
import { verifyPassword } from '@/lib/auth/password';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import {
  MAIN_CLINIC_ID,
  NEIGHBOR_CLINIC_ID,
  seedHomologation,
} from '../../scripts/seed/seed';

const NOW = new Date('2026-10-19T15:00:00Z');
const PASSWORD = 'senha-ficticia-123';

const accountOf = async (email: string) => {
  const { userAccounts } = await getRepositories(systemScope());
  return userAccounts.findByEmail(email);
};

describe('Feature: Contas e cenários do seed de homologação (docs/engineering/homologacao-cenarios.md)', () => {
  it('Dado banco vazio, Quando semear, Então todas as contas fictícias entram com a mesma senha', async () => {
    await seedHomologation({ password: PASSWORD, now: NOW });

    const { userAccounts } = await getRepositories(systemScope());
    const seeded = (await userAccounts.findAll()).filter((account) =>
      account.email.endsWith('@homologacao.invalid'),
    );
    expect(seeded).toHaveLength(13);
    for (const account of seeded) {
      expect(await verifyPassword(PASSWORD, account.passwordHash)).toBe(true);
    }
  });

  it('Dado o seed, Então a conta inativa existe e não pode entrar', async () => {
    expect((await accountOf('inativo@homologacao.invalid'))?.isActive).toBe(
      false,
    );
  });

  it('Dado o seed, Então cada equipe tem seu papel e o profissional2 aponta para outro profissional', async () => {
    const first = await accountOf('profissional@homologacao.invalid');
    const second = await accountOf('profissional2@homologacao.invalid');

    expect(first?.professionalId).toBeTruthy();
    expect(second?.professionalId).toBeTruthy();
    expect(second?.professionalId).not.toBe(first?.professionalId);
    expect((await accountOf('admin2@homologacao.invalid'))?.role).toBe(
      'company_admin',
    );
  });

  it('Dado o seed, Então os portais ligam a cadastros reais da clínica principal', async () => {
    const repos = await getRepositories(clinicScope(MAIN_CLINIC_ID));
    const patientAccount = await accountOf('paciente@homologacao.invalid');
    const guardianAccount = await accountOf('responsavel@homologacao.invalid');
    const partnerAccount = await accountOf('parceiro@homologacao.invalid');

    const patient = await repos.patients.findById(
      patientAccount?.patientId ?? '',
    );
    expect(patient?.email).toBeTruthy();
    expect(guardianAccount?.guardianId).toBeTruthy();
    const minors = (await repos.patients.findAll()).filter(
      (candidate) => candidate.guardianId === guardianAccount?.guardianId,
    );
    expect(minors).toHaveLength(1);
    expect(
      (await repos.partners.findAll()).some(
        (partner) => partner.id === partnerAccount?.partnerId,
      ),
    ).toBe(true);
  });

  it('Dado o seed, Então o paciente tem os dois termos aceitos e o paciente novo não tem nenhum', async () => {
    const repos = await getRepositories(clinicScope(MAIN_CLINIC_ID));
    const accepted = await accountOf('paciente@homologacao.invalid');
    const fresh = await accountOf('paciente-novo@homologacao.invalid');

    const acceptedRecords = await repos.consentRecords.findByPatientId(
      accepted?.patientId ?? '',
    );
    const freshRecords = await repos.consentRecords.findByPatientId(
      fresh?.patientId ?? '',
    );
    expect(acceptedRecords.map((record) => record.purpose).sort()).toEqual([
      'image',
      'treatment',
    ]);
    expect(freshRecords).toEqual([]);
    expect(
      acceptedRecords.every((record) => record instanceof ConsentRecord),
    ).toBe(true);
  });

  it('Dado a clínica vizinha, Então tem massa própria, sem CNPJ, e a principal não enxerga os pacientes dela', async () => {
    const { clinics } = await getRepositories(systemScope());
    const neighbor = await clinics.findById(NEIGHBOR_CLINIC_ID);
    const neighborRepos = await getRepositories(
      clinicScope(NEIGHBOR_CLINIC_ID),
    );
    const mainRepos = await getRepositories(clinicScope(MAIN_CLINIC_ID));

    expect(neighbor?.isSuspended).toBe(false);
    expect(neighbor?.cnpj ?? null).toBeNull();
    expect(await neighborRepos.patients.findAll()).toHaveLength(3);
    const mainNames = (await mainRepos.patients.findAll()).map(
      (patient) => patient.fullName,
    );
    expect(mainNames.some((name) => name.startsWith('Paciente Vizinho'))).toBe(
      false,
    );
  });
});
