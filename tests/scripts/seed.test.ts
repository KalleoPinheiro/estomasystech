process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

import { describe, expect, it } from 'vitest';
import { isValidCpf } from '@/domain/shared/cpf';
import { getRepositories } from '@/infrastructure/container';
import { verifyPassword } from '@/lib/auth/password';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import {
  birthDateForAge,
  fakeCpf,
  fakeEmail,
  initFaker,
} from '../../scripts/seed/data';
import {
  MAIN_CLINIC_ID,
  PATIENT_COUNT,
  SUSPENDED_CLINIC_ID,
  seedHomologation,
} from '../../scripts/seed/seed';

const NOW = new Date('2026-10-19T15:00:00Z');

describe('Feature: Seed de homologação com faker (ADR-041)', () => {
  it('Dado banco vazio, Quando semear, Então cria a massa com cenários de sucesso e de erro', async () => {
    const report = await seedHomologation({
      password: 'senha-ficticia-123',
      now: NOW,
    });

    expect(report.skipped).toBe(false);
    expect(report.counts).toMatchObject({
      clinics: 2,
      accounts: 5,
      professionals: 2,
      procedures: 6,
      patients: PATIENT_COUNT,
      supplyBatches: 5,
    });
    expect(report.counts.appointments).toBeGreaterThan(40);
    expect(report.counts.invoices).toBeGreaterThan(10);
    expect(report.counts.assessments).toBe(100);

    const { clinics } = await getRepositories(systemScope());
    expect((await clinics.findById(SUSPENDED_CLINIC_ID))?.isSuspended).toBe(
      true,
    );
    expect((await clinics.findById(MAIN_CLINIC_ID))?.isSuspended).toBe(false);

    const repos = await getRepositories(clinicScope(MAIN_CLINIC_ID));
    const patients = await repos.patients.findAll();
    expect(patients.length).toBeGreaterThanOrEqual(40);
    expect(patients.some((patient) => !patient.email)).toBe(true);
    expect(patients.some((patient) => !patient.cpf)).toBe(true);
    expect(patients.some((patient) => patient.guardianId)).toBe(true);

    const supplies = await repos.supplies.findAll();
    expect(supplies.some((supply) => supply.stockQty === 0)).toBe(true);
    const { userAccounts } = await getRepositories(systemScope());
    expect(
      await userAccounts.findByEmail('super@homologacao.invalid'),
    ).not.toBeNull();
  });

  it('Dado já semeado, Quando semear de novo, Então só reaplica a senha das contas', async () => {
    const before = (
      await (
        await getRepositories(clinicScope(MAIN_CLINIC_ID))
      ).patients.findAll()
    ).length;

    const report = await seedHomologation({
      password: 'senha-ficticia-123',
      now: NOW,
    });

    expect(report).toEqual({ skipped: true, counts: { passwordsSynced: 5 } });
    const after = (
      await (
        await getRepositories(clinicScope(MAIN_CLINIC_ID))
      ).patients.findAll()
    ).length;
    expect(after).toBe(before);
  });

  it('Dado já semeado, Quando a senha mudar e semear de novo, Então o login passa a valer com a senha nova', async () => {
    await seedHomologation({ password: 'senha-nova-456789', now: NOW });

    const { userAccounts } = await getRepositories(systemScope());
    const admin = await userAccounts.findByEmail('admin@homologacao.invalid');
    expect(
      await verifyPassword('senha-nova-456789', admin?.passwordHash ?? ''),
    ).toBe(true);
    expect(
      await verifyPassword('senha-ficticia-123', admin?.passwordHash ?? ''),
    ).toBe(false);
  });
});

describe('Feature: Geradores determinísticos do faker', () => {
  it('Dado a mesma semente, Então gera os mesmos CPFs, todos válidos', () => {
    initFaker(NOW);
    const first = Array.from({ length: 5 }, fakeCpf);
    initFaker(NOW);
    const second = Array.from({ length: 5 }, fakeCpf);

    expect(first).toEqual(second);
    expect(first.every(isValidCpf)).toBe(true);
  });

  it('Dado um nome com acento, Então o e-mail usa domínio reservado sem acento', () => {
    expect(fakeEmail('Zélia D’Ávila', 3)).toBe(
      'zelia.d.avila.3@homologacao.invalid',
    );
  });

  it('Dado uma idade, Então a data de nascimento fica no ano esperado', () => {
    initFaker(NOW);
    const birth = birthDateForAge(30, NOW);
    expect(
      NOW.getUTCFullYear() - birth.getUTCFullYear(),
    ).toBeGreaterThanOrEqual(29);
  });
});
