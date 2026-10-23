process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

import { and, eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { verifyPassword } from '@/lib/auth/password';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import {
  MAIN_CLINIC_ID,
  NEIGHBOR_CLINIC_ID,
  PATIENT_COUNT,
  seedHomologation,
} from '../../scripts/seed/seed';

const NOW = new Date('2026-10-19T15:00:00Z');
const PASSWORD = 'senha-ficticia-123';
const NEW_ACCOUNTS = [
  'admin2',
  'profissional2',
  'inativo',
  'admin-vizinha',
  'paciente',
  'paciente-novo',
  'responsavel',
  'parceiro',
].map((name) => `${name}@homologacao.invalid`);

/** Deixa o banco como o seed anterior ao PR #434 o deixava: sem as 8 contas, sem a vizinha e sem o parceiro. */
async function regressToOldSeed(): Promise<void> {
  const db = await getDb();
  await db
    .delete(schema.userAccounts)
    .where(inArray(schema.userAccounts.email, NEW_ACCOUNTS));
  // TESTE-ALTERADO: o seed agora indica pacientes pela parceira; o seed antigo não tinha indicação.
  await db
    .update(schema.patients)
    .set({ referredByPartnerId: null })
    .where(eq(schema.patients.clinicId, MAIN_CLINIC_ID));
  await db
    .delete(schema.partnerShareConsents)
    .where(eq(schema.partnerShareConsents.clinicId, MAIN_CLINIC_ID));
  await db
    .delete(schema.partners)
    .where(eq(schema.partners.clinicId, MAIN_CLINIC_ID));
  // TESTE-ALTERADO: a vizinha agora tem consulta e fatura paga (recibo bloqueado por CNPJ); o seed antigo não tinha.
  for (const table of [
    schema.invoicePayments,
    schema.invoices,
    schema.appointments,
  ]) {
    await db.delete(table).where(eq(table.clinicId, NEIGHBOR_CLINIC_ID));
  }
  for (const table of [schema.patients, schema.professionals]) {
    await db.delete(table).where(eq(table.clinicId, NEIGHBOR_CLINIC_ID));
  }
  await db
    .delete(schema.clinics)
    .where(and(eq(schema.clinics.id, NEIGHBOR_CLINIC_ID)));
}

async function snapshot() {
  const main = await getRepositories(clinicScope(MAIN_CLINIC_ID));
  const neighbor = await getRepositories(clinicScope(NEIGHBOR_CLINIC_ID));
  const { userAccounts, clinics } = await getRepositories(systemScope());
  return {
    patients: (await main.patients.findAll()).length,
    professionals: (await main.professionals.findAll()).length,
    invoices: (await main.invoices.findAll()).length,
    partners: (await main.partners.findAll()).length,
    neighborPatients: (await neighbor.patients.findAll()).length,
    neighborProfessionals: (await neighbor.professionals.findAll()).length,
    accounts: (await userAccounts.findAll()).length,
    clinics: (await clinics.findAll()).length,
  };
}

describe('Feature: Seed de homologação aditivo (cria o que falta, sem apagar nem duplicar)', () => {
  it('Dado banco vazio, Quando semear, Então cria as 13 contas e as 3 clínicas', async () => {
    const report = await seedHomologation({ password: PASSWORD, now: NOW });

    expect(report.skipped).toBe(false);
    expect(report.counts).toMatchObject({ clinics: 3, accounts: 13 });
    expect((await snapshot()).accounts).toBe(13);
  });

  it('Dado banco já completo, Quando semear de novo, Então nada é criado e só a senha é reaplicada', async () => {
    const before = await snapshot();

    const report = await seedHomologation({ password: PASSWORD, now: NOW });

    expect(report).toEqual({ skipped: true, counts: { passwordsSynced: 13 } });
    expect(await snapshot()).toEqual(before);
  });

  it('Dado banco semeado antes das contas novas, Quando semear, Então cria só as 8 contas, a vizinha e o parceiro, sem duplicar nada', async () => {
    const complete = await snapshot();
    await regressToOldSeed();
    const { userAccounts } = await getRepositories(systemScope());
    expect(
      await userAccounts.findByEmail('paciente@homologacao.invalid'),
    ).toBeNull();
    const oldAdmin = await userAccounts.findByEmail(
      'admin@homologacao.invalid',
    );

    const report = await seedHomologation({ password: PASSWORD, now: NOW });

    expect(report.skipped).toBe(false);
    expect(report.counts).toMatchObject({
      clinics: 1,
      accounts: 8,
      neighborPatients: 3,
      passwordsSynced: 13,
    });
    expect(await snapshot()).toEqual(complete);
    expect((await snapshot()).patients).toBe(PATIENT_COUNT);
    for (const email of NEW_ACCOUNTS) {
      expect(await userAccounts.findByEmail(email)).not.toBeNull();
    }
    // As contas que já existiam seguem as mesmas (não foram recriadas).
    expect(
      (await userAccounts.findByEmail('admin@homologacao.invalid'))?.id,
    ).toBe(oldAdmin?.id);
  });

  it('Dado conta de portal recriada, Então paciente tem os dois termos, o paciente novo nenhum, e cada portal usa um cadastro diferente', async () => {
    const { userAccounts } = await getRepositories(systemScope());
    const main = await getRepositories(clinicScope(MAIN_CLINIC_ID));
    const withTerms = await userAccounts.findByEmail(
      'paciente@homologacao.invalid',
    );
    const withoutTerms = await userAccounts.findByEmail(
      'paciente-novo@homologacao.invalid',
    );
    const guardian = await userAccounts.findByEmail(
      'responsavel@homologacao.invalid',
    );

    expect(withTerms?.patientId).not.toBe(withoutTerms?.patientId);
    expect(
      (await main.consentRecords.findByPatientId(withTerms?.patientId ?? ''))
        .map((r) => r.purpose)
        .sort(),
    ).toEqual(['image', 'treatment']);
    expect(
      await main.consentRecords.findByPatientId(withoutTerms?.patientId ?? ''),
    ).toEqual([]);
    expect(guardian?.guardianId).toBeTruthy();
  });

  it('Dado a senha trocada, Quando semear de novo, Então as contas criadas depois também entram com a senha nova', async () => {
    await seedHomologation({ password: 'senha-nova-456789', now: NOW });

    const { userAccounts } = await getRepositories(systemScope());
    const account = await userAccounts.findByEmail(
      'parceiro@homologacao.invalid',
    );
    expect(
      await verifyPassword('senha-nova-456789', account?.passwordHash ?? ''),
    ).toBe(true);
  });
});
