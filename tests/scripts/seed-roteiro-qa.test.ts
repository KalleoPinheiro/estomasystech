process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

import { describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import {
  MAIN_CLINIC_ID,
  NEIGHBOR_CLINIC_ID,
  seedHomologation,
} from '../../scripts/seed/seed';

const NOW = new Date('2026-10-22T15:00:00Z');
const PASSWORD = 'senha-ficticia-123';

const main = () => getRepositories(clinicScope(MAIN_CLINIC_ID));

describe('Feature: Seed cobre os cenários do roteiro de homologação (#477)', () => {
  it('Dado banco vazio, Quando semear, Então os cenários entram junto da massa', async () => {
    const report = await seedHomologation({ password: PASSWORD, now: NOW });

    expect(report.counts.scenarios).toBeGreaterThan(0);
  });

  it('Dada a grade da principal, Então a pausa de almoço é 12:00–13:00', async () => {
    const { scheduleConfig } = await main();

    expect((await scheduleConfig.get())?.lunchBreak).toEqual({
      startMinute: 720,
      endMinute: 780,
    });
  });

  it('Dada a equipe, Então Ana tem repasse percentual e Bruno valor fixo', async () => {
    const { professionals } = await main();
    const all = await professionals.findAll();

    const ana = all.find((item) => item.fullName.startsWith('Ana'));
    const bruno = all.find((item) => item.fullName.startsWith('Bruno'));
    expect(ana?.commissionRule).toEqual({ kind: 'percentage', pct: 40 });
    expect(bruno?.commissionType).toBe('fixed');
  });

  it('Dados os procedimentos, Então curativo simples e troca de bolsa têm kit', async () => {
    const { procedures, procedureKits } = await main();
    const byName = new Map(
      (await procedures.findAll()).map((item) => [item.name, item.id]),
    );

    expect(
      (await procedureKits.getKit(byName.get('Curativo simples') ?? '')).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await procedureKits.getKit(
          byName.get('Troca de bolsa de estomia') ?? '',
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it('Dada a clínica principal, Então tem responsável técnico e emite documento', async () => {
    const { clinics } = await getRepositories(systemScope());

    expect(
      (await clinics.findById(MAIN_CLINIC_ID))?.isCompleteForDocumentEmission(),
    ).toBe(true);
  });

  it('Dada a vizinha, Então tem uma consulta concluída e uma fatura paga, sem CNPJ', async () => {
    const neighbor = await getRepositories(clinicScope(NEIGHBOR_CLINIC_ID));
    const { clinics } = await getRepositories(systemScope());

    const invoices = await neighbor.invoices.findAll();
    expect(invoices).toHaveLength(1);
    expect(invoices[0].status).toBe('paid');
    expect((await clinics.findById(NEIGHBOR_CLINIC_ID))?.cnpj).toBeFalsy();
  });

  it('Dado o paciente do portal, Então tem duas consultas futuras (uma a menos de 24 h), uma fatura pendente e um retorno pendente', async () => {
    const { userAccounts } = await getRepositories(systemScope());
    const account = await userAccounts.findByEmail(
      'paciente@homologacao.invalid',
    );
    const repos = await main();

    const appointments = await repos.appointments.findByPatientId(
      account?.patientId ?? '',
    );
    const future = appointments.filter(
      (item) => item.slot.start.getTime() > NOW.getTime(),
    );
    expect(future).toHaveLength(2);
    expect(
      future.some(
        (item) => item.slot.start.getTime() - NOW.getTime() < 24 * 3_600_000,
      ),
    ).toBe(true);
    const invoices = (await repos.invoices.findAll()).filter(
      (item) => item.patientId === account?.patientId,
    );
    expect(invoices.map((item) => item.status)).toContain('pending');
    const returns = await repos.followUps.findAll({ status: 'pending' });
    expect(returns.some((item) => item.patientId === account?.patientId)).toBe(
      true,
    );
  });

  it('Dada a parceira, Então indicou pacientes e um deles aceitou compartilhar', async () => {
    const { userAccounts } = await getRepositories(systemScope());
    const account = await userAccounts.findByEmail(
      'parceiro@homologacao.invalid',
    );
    const repos = await main();

    const referred = (await repos.patients.findAll()).filter(
      (item) => item.referredByPartnerId === account?.partnerId,
    );
    expect(referred).toHaveLength(2);
    const accepted = await Promise.all(
      referred.map(async (item) =>
        (await repos.partnerShareConsents.findByPatientId(item.id)).some(
          (consent) => consent.kind === 'accept',
        ),
      ),
    );
    expect(accepted.filter(Boolean)).toHaveLength(1);
  });

  it('Dadas as faturas pagas, Então o pagamento nunca antecede a emissão', async () => {
    const repos = await main();

    const paid = (await repos.invoices.findAll()).filter((item) => item.paidAt);
    expect(paid.length).toBeGreaterThan(0);
    for (const invoice of paid) {
      expect(invoice.paidAt?.getTime()).toBeGreaterThanOrEqual(
        invoice.issuedAt.getTime(),
      );
    }
  });

  it('Dado o prontuário semeado, Então criança não tem pé diabético, as avaliações têm datas distintas e há anamnese e evolução', async () => {
    const repos = await main();
    const patients = await repos.patients.findAll();
    const child = patients.find((item) => item.guardianId);
    const withCondition = (
      await Promise.all(
        patients.map(async (item) => ({
          patient: item,
          conditions: await repos.conditions.findByPatientId(item.id),
        })),
      )
    ).filter((item) => item.conditions.length > 0);

    for (const { patient, conditions } of withCondition) {
      if (patient.guardianId) {
        expect(conditions.map((item) => item.title)).not.toContain(
          'Pé diabético',
        );
      }
    }
    expect(child).toBeTruthy();
    const [{ patient, conditions }] = withCondition;
    const stamps = (
      await repos.assessments.findByConditionId(conditions[0].id)
    ).map((item) => item.createdAt.getTime());
    expect(new Set(stamps).size).toBe(stamps.length);
    expect(stamps.length).toBeGreaterThan(1);
    expect(await repos.anamneses.findByPatientId(patient.id)).toBeTruthy();
    expect((await repos.evolutions.findByPatientId(patient.id)).length).toBe(1);
  });
});
