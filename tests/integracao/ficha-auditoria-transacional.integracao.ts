import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Partner } from '@/domain/partner/partner';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildPatient, buildProfessional } from '../support/builders';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };
const refreshed = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
  headers: async () => ({ get: () => '203.0.113.9' }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));

const signIn = (
  role: Parameters<typeof sessionToken>[0],
  professionalId: string | null = null,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    CLINIC_A_ID,
    professionalId,
  );
};

/** Faz toda gravação de auditoria falhar, como uma trilha fora do ar. */
async function breakAudit(name: string) {
  await (await getDb()).execute(
    sql.raw(
      `ALTER TABLE audit_events ADD CONSTRAINT ${name} CHECK (false) NOT VALID`,
    ),
  );
}
async function fixAudit(name: string) {
  await (await getDb()).execute(
    sql.raw(`ALTER TABLE audit_events DROP CONSTRAINT ${name}`),
  );
}

beforeEach(async () => {
  await ensureTestClinics();
  refreshed.mockClear();
});

describe('Feature: a ficha grava e audita na mesma transação (ADR-075, ADR-080, Postgres real)', () => {
  it('Dado que a trilha falha, Quando a atendente salva a anamnese, Então nada fica gravado e a tela não atualiza', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const patient = buildPatient();
    await repos.patients.save(patient);
    signIn('atendente');
    const { saveAnamnesis } = await import(
      '@/app/(staff)/pacientes/[id]/actions/cadastro'
    );
    await breakAudit('audit_falha_ficha_anamnese');

    try {
      const result = await saveAnamnesis({
        patientId: patient.id,
        body: { allergies: 'Látex' },
      });

      expect(result.success).toBe(false);
      expect(await repos.anamneses.findByPatientId(patient.id)).toBeNull();
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      await fixAudit('audit_falha_ficha_anamnese');
    }
  });

  it('Dado que a trilha falha, Quando a atendente cadastra o responsável, Então o responsável não fica gravado', async () => {
    signIn('atendente');
    const { createGuardian } = await import(
      '@/app/(staff)/pacientes/[id]/actions/cadastro'
    );
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    await breakAudit('audit_falha_ficha_responsavel');

    try {
      const result = await createGuardian({
        fullName: 'Responsável Desfeito',
        relationship: 'mae',
        phone: '+5511900003333',
      });

      expect(result.success).toBe(false);
      expect(
        (await repos.guardians.findAll('Responsável Desfeito')).length,
      ).toBe(0);
    } finally {
      await fixAudit('audit_falha_ficha_responsavel');
    }
  });

  it('Dado que a trilha falha, Quando o Profissional registra evolução, Então nem a nota nem o vínculo ficam gravados', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    const patient = buildPatient();
    await repos.patients.save(patient);
    await repos.professionalPatientLinks.ensureLink(
      professional.id,
      patient.id,
    );
    signIn('profissional', professional.id);
    const { createCondition, addEvolutionNote } = await import(
      '@/app/(staff)/pacientes/[id]/actions/prontuario'
    );
    await breakAudit('audit_falha_ficha_prontuario');

    try {
      const evolution = await addEvolutionNote({
        patientId: patient.id,
        body: { subjective: 'Dor' },
      });
      const condition = await createCondition({
        patientId: patient.id,
        body: { kind: 'wound', title: 'Lesão desfeita' },
      });

      expect(evolution.success).toBe(false);
      expect(condition.success).toBe(false);
      expect(await repos.evolutions.findByPatientId(patient.id)).toHaveLength(
        0,
      );
      expect(await repos.conditions.findByPatientId(patient.id)).toHaveLength(
        0,
      );
      expect(refreshed).not.toHaveBeenCalled();
    } finally {
      await fixAudit('audit_falha_ficha_prontuario');
    }
  });

  it('Dado que a trilha falha, Quando o Profissional abre um plano de cuidados, Então o plano não fica gravado', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const professional = buildProfessional();
    await repos.professionals.save(professional);
    const patient = buildPatient();
    await repos.patients.save(patient);
    await repos.professionalPatientLinks.ensureLink(
      professional.id,
      patient.id,
    );
    signIn('profissional', professional.id);
    const { openCarePlan } = await import(
      '@/app/(staff)/pacientes/[id]/actions/plano-cuidados'
    );
    await breakAudit('audit_falha_ficha_plano');

    try {
      const result = await openCarePlan({ patientId: patient.id, body: {} });

      expect(result.success).toBe(false);
      expect(await repos.carePlans.findByPatientId(patient.id)).toHaveLength(0);
    } finally {
      await fixAudit('audit_falha_ficha_plano');
    }
  });

  it('Dado que a trilha falha, Quando a atendente lança o consentimento em papel, Então o registro não fica gravado', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const partner = Partner.create({
      fullName: 'Parceiro Integração',
      email: `${crypto.randomUUID()}@parceiro.com`,
      phone: '11999990000',
    });
    await repos.partners.save(partner);
    const patient = buildPatient({ referredByPartnerId: partner.id });
    await repos.patients.save(patient);
    signIn('atendente');
    const { registerPaperConsent } = await import(
      '@/app/(staff)/pacientes/[id]/actions/consentimento'
    );
    await breakAudit('audit_falha_ficha_consentimento');

    try {
      const result = await registerPaperConsent({ patientId: patient.id });

      expect(result.success).toBe(false);
      expect(
        await repos.partnerShareConsents.findByPatientId(patient.id),
      ).toHaveLength(0);
    } finally {
      await fixAudit('audit_falha_ficha_consentimento');
    }
  });
});
