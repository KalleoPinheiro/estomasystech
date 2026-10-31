import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Partner } from '@/domain/partner/partner';
import { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import { NursingIntervention } from '@/domain/taxonomy/nursing-intervention';
import { NursingOutcome } from '@/domain/taxonomy/nursing-outcome';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { buildPatient, buildProfessional } from '../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
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
  clinicId: string = CLINIC_A_ID,
  professionalId: string | null = null,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    clinicId,
    professionalId,
  );
};

const cadastro = () => import('@/app/(staff)/pacientes/[id]/actions/cadastro');
const prontuario = () =>
  import('@/app/(staff)/pacientes/[id]/actions/prontuario');
const plano = () =>
  import('@/app/(staff)/pacientes/[id]/actions/plano-cuidados');
const consentimento = () =>
  import('@/app/(staff)/pacientes/[id]/actions/consentimento');

const repos = () => getRepositories(clinicScope(CLINIC_A_ID));

const auditOf = async (resourceType: string) =>
  (await (await repos()).auditEvents.findAll()).filter(
    (event) => event.resourceType === resourceType,
  );

/** Paciente da clínica A, com o Profissional vinculado quando `linked`. */
async function patientWithProfessional(linked: boolean) {
  const r = await repos();
  const professional = buildProfessional();
  await r.professionals.save(professional);
  const patient = buildPatient();
  await r.patients.save(patient);
  if (linked)
    await r.professionalPatientLinks.ensureLink(professional.id, patient.id);
  return { patient, professional };
}

beforeAll(async () => {
  await ensureTestClinics();
  const { nursingDiagnoses, nursingOutcomes, nursingInterventions } =
    await getRepositories(systemScope());
  await nursingDiagnoses.save(
    NursingDiagnosis.create({
      code: '00046',
      label: 'Integridade da pele prejudicada',
      domain: 'Domínio 11',
      class: 'Classe 2',
      edition: 'NANDA-I 2021-2023',
    }),
  );
  await nursingOutcomes.save(
    NursingOutcome.create({
      code: '1101',
      label: 'Integridade tissular: pele e mucosas',
      domain: 'Saúde fisiológica',
      class: 'Integridade tissular',
      edition: 'NOC 6ª ed.',
      scaleAnchors: ['a', 'b', 'c', 'd', 'e'],
    }),
  );
  await nursingInterventions.save(
    NursingIntervention.create({
      code: '3660',
      label: 'Cuidados com lesões',
      domain: 'Fisiológico: básico',
      class: 'Controle de pele/lesão',
      edition: 'NIC 7ª ed.',
    }),
  );
});

beforeEach(() => {
  cookieStore.value = undefined;
  refreshed.mockClear();
});

describe('Feature: gravações da ficha do paciente como Server Actions (#552, ADR-080)', () => {
  describe('Scenario: sessão e escopo', () => {
    it('Dado que não há sessão, Quando salva a anamnese, Então responde Não autenticado e nada é gravado', async () => {
      const { patient } = await patientWithProfessional(false);
      const { saveAnamnesis } = await cadastro();

      const result = await saveAnamnesis({
        patientId: patient.id,
        body: { allergies: 'Látex' },
      });

      expect(result.error).toBe('Não autenticado');
      expect(
        await (await repos()).anamneses.findByPatientId(patient.id),
      ).toBeNull();
      expect(refreshed).not.toHaveBeenCalled();
    });

    it('Dado o papel de portal, Quando cria uma condição, Então é recusado', async () => {
      const { patient } = await patientWithProfessional(false);
      signIn('patient');
      const { createCondition } = await prontuario();

      const result = await createCondition({
        patientId: patient.id,
        body: { kind: 'wound', title: 'Lesão' },
      });

      expect(result.success).toBe(false);
    });

    it('Dado paciente de outra empresa, Quando a atendente da A salva a anamnese, Então é 404 e nada é gravado', async () => {
      const other = await getRepositories(clinicScope(CLINIC_B_ID));
      const stranger = buildPatient();
      await other.patients.save(stranger);
      signIn('atendente');
      const { saveAnamnesis } = await cadastro();

      const result = await saveAnamnesis({
        patientId: stranger.id,
        body: { allergies: 'Látex' },
      });

      expect(result.success).toBe(false);
      expect(await other.anamneses.findByPatientId(stranger.id)).toBeNull();
    });
  });

  describe('Scenario: R4 do Profissional', () => {
    it('Dado Profissional sem vínculo, Quando grava anamnese, condição, evolução e plano, Então todas recusam e nada é gravado', async () => {
      const { patient, professional } = await patientWithProfessional(false);
      signIn('profissional', CLINIC_A_ID, professional.id);
      const { saveAnamnesis } = await cadastro();
      const { createCondition, addEvolutionNote } = await prontuario();
      const { openCarePlan } = await plano();

      const results = await Promise.all([
        saveAnamnesis({ patientId: patient.id, body: { notes: 'x' } }),
        createCondition({
          patientId: patient.id,
          body: { kind: 'wound', title: 'Lesão' },
        }),
        addEvolutionNote({ patientId: patient.id, body: {} }),
        openCarePlan({ patientId: patient.id, body: {} }),
      ]);

      expect(results.map((r) => r.success)).toEqual([
        false,
        false,
        false,
        false,
      ]);
      const r = await repos();
      expect(await r.conditions.findByPatientId(patient.id)).toHaveLength(0);
      expect(await r.carePlans.findByPatientId(patient.id)).toHaveLength(0);
      expect(await r.evolutions.findByPatientId(patient.id)).toHaveLength(0);
      expect(refreshed).not.toHaveBeenCalled();
    });
  });

  describe('Scenario: cadastro, condição e evolução', () => {
    it('Dado a atendente, Quando salva a anamnese, Então grava, audita e atualiza a tela', async () => {
      const { patient } = await patientWithProfessional(false);
      signIn('atendente');
      const { saveAnamnesis } = await cadastro();

      const result = await saveAnamnesis({
        patientId: patient.id,
        body: { allergies: 'Látex' },
      });

      expect(result.success).toBe(true);
      expect(
        (await (await repos()).anamneses.findByPatientId(patient.id))
          ?.allergies,
      ).toBe('Látex');
      await vi.waitFor(async () => {
        const events = (await auditOf('anamnesis')).filter(
          (e) => e.patientId === patient.id,
        );
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ action: 'update' });
      });
      expect(refreshed).toHaveBeenCalledTimes(1);
    });

    it('Dado Profissional vinculado, Quando cria condição, avalia e resolve, Então a trilha leva o paciente da condição', async () => {
      const { patient, professional } = await patientWithProfessional(true);
      signIn('profissional', CLINIC_A_ID, professional.id);
      const { createCondition, addConditionAssessment, resolveCondition } =
        await prontuario();

      const created = await createCondition({
        patientId: patient.id,
        body: { kind: 'wound', title: 'Lesão sacral' },
      });
      const conditionId = created.data?.id as string;
      const assessed = await addConditionAssessment({
        id: conditionId,
        body: { lengthMm: 20, widthMm: 10, painScale: 3 },
      });
      const resolved = await resolveCondition({ id: conditionId });

      expect([created, assessed, resolved].map((r) => r.success)).toEqual([
        true,
        true,
        true,
      ]);
      const r = await repos();
      expect(await r.assessments.findByConditionId(conditionId)).toHaveLength(
        1,
      );
      expect((await r.conditions.findById(conditionId))?.status).not.toBe(
        'active',
      );
      const assessmentEvents = await auditOf('assessment');
      expect(assessmentEvents.at(-1)).toMatchObject({
        action: 'create',
        patientId: patient.id,
      });
      const conditionEvents = (await auditOf('condition')).filter(
        (e) => e.resourceId === conditionId,
      );
      expect(conditionEvents.map((e) => e.action).sort()).toEqual([
        'create',
        'update',
      ]);
    });

    it('Dado o corpo inválido, Quando cria condição sem título, Então a validação recusa antes de gravar', async () => {
      const { patient } = await patientWithProfessional(false);
      signIn('atendente');
      const { createCondition } = await prontuario();

      const result = await createCondition({
        patientId: patient.id,
        body: { kind: 'wound', title: '' },
      });

      expect(result.success).toBe(false);
      expect(
        await (await repos()).conditions.findByPatientId(patient.id),
      ).toHaveLength(0);
    });

    it('Dado Profissional vinculado, Quando registra evolução, Então a autoria vem da sessão e o vínculo é renovado', async () => {
      const { patient, professional } = await patientWithProfessional(true);
      signIn('profissional', CLINIC_A_ID, professional.id);
      const { addEvolutionNote } = await prontuario();

      const result = await addEvolutionNote({
        patientId: patient.id,
        body: { subjective: 'Dor leve' },
      });

      expect(result.success).toBe(true);
      const notes = await (await repos()).evolutions.findByPatientId(
        patient.id,
      );
      expect(notes).toHaveLength(1);
      expect(notes[0]?.professionalId).toBe(professional.id);
      expect(
        (await auditOf('evolution')).filter((e) => e.patientId === patient.id),
      ).toHaveLength(1);
    });
  });

  describe('Scenario: plano de cuidados', () => {
    it('Dado Profissional vinculado, Quando abre o plano e prescreve, avalia e registra, Então cada gravação é auditada com o paciente do plano', async () => {
      const { patient, professional } = await patientWithProfessional(true);
      signIn('profissional', CLINIC_A_ID, professional.id);
      const actions = await plano();

      const opened = await actions.openCarePlan({
        patientId: patient.id,
        body: {},
      });
      const planId = opened.data?.id as string;
      const diagnosis = await actions.addCarePlanDiagnosis({
        id: planId,
        body: {
          diagnosisCode: '00046',
          type: 'real',
          relatedFactors: 'Umidade',
          definingCharacteristics: 'Dor aguda',
        },
      });
      const outcome = await actions.prescribeCarePlanOutcome({
        id: planId,
        body: { outcomeCode: '1101', baselineScore: 2, targetScore: 4 },
      });
      const intervention = await actions.prescribeCarePlanIntervention({
        id: planId,
        body: {
          interventionCode: '3660',
          frequency: 'Diária',
          priority: 'alta',
        },
      });
      const evaluation = await actions.evaluateCarePlanOutcome({
        id: outcome.data?.outcome.id as string,
        body: { score: 3 },
      });
      const record = await actions.recordCarePlanIntervention({
        id: intervention.data?.intervention.id as string,
        body: {},
      });
      const resolved = await actions.resolveCarePlan({ id: planId });

      expect(
        [
          opened,
          diagnosis,
          outcome,
          intervention,
          evaluation,
          record,
          resolved,
        ].map((r) => r.error ?? 'ok'),
      ).toEqual(Array(7).fill('ok'));
      const types = [
        'care_plan',
        'care_plan_diagnosis',
        'care_plan_outcome',
        'care_plan_intervention',
        'outcome_evaluation',
        'intervention_record',
      ];
      for (const type of types) {
        const events = (await auditOf(type)).filter(
          (e) => e.patientId === patient.id,
        );
        expect(events.length, type).toBeGreaterThan(0);
      }
      const record2 = (await auditOf('intervention_record')).at(-1);
      expect(record2?.patientId).toBe(patient.id);
    });

    it('Dado plano de outra empresa, Quando a atendente da A prescreve resultado, Então é 404 e nada é gravado', async () => {
      const other = await getRepositories(clinicScope(CLINIC_B_ID));
      const stranger = buildPatient();
      await other.patients.save(stranger);
      signIn('company_admin', CLINIC_B_ID);
      const planB = await (await plano()).openCarePlan({
        patientId: stranger.id,
        body: {},
      });
      signIn('atendente');

      const result = await (await plano()).prescribeCarePlanOutcome({
        id: planB.data?.id as string,
        body: { outcomeCode: '1101', baselineScore: 1, targetScore: 3 },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Scenario: responsável', () => {
    it('Dado a atendente, Quando cadastra, vincula, atualiza e exclui o responsável, Então a trilha não leva o contato', async () => {
      const { patient } = await patientWithProfessional(false);
      signIn('atendente');
      const actions = await cadastro();

      const created = await actions.createGuardian({
        fullName: 'Maria Souza',
        relationship: 'mae',
        phone: '+5511900001111',
        email: 'maria@example.com',
      });
      const guardianId = created.data?.id as string;
      const linked = await actions.linkPatientGuardian({
        patientId: patient.id,
        guardianId,
      });
      const updated = await actions.updateGuardian({
        id: guardianId,
        body: { phone: '+5511900002222' },
      });
      const unlinked = await actions.linkPatientGuardian({
        patientId: patient.id,
        guardianId: null,
      });
      const deleted = await actions.deleteGuardian({ id: guardianId });

      expect(
        [created, linked, updated, unlinked, deleted].map(
          (r) => r.error ?? 'ok',
        ),
      ).toEqual(Array(5).fill('ok'));
      const guardianEvents = (await auditOf('guardian')).filter(
        (e) => e.resourceId === guardianId,
      );
      expect(guardianEvents.map((e) => e.action).sort()).toEqual([
        'create',
        'delete',
        'update',
      ]);
      const serialized = JSON.stringify(guardianEvents);
      expect(serialized).not.toContain('+5511900002222');
      expect(serialized).not.toContain('maria@example.com');
      const patientEvents = (await auditOf('patient')).filter(
        (e) => e.patientId === patient.id,
      );
      expect(patientEvents.map((e) => e.detail)).toEqual(
        expect.arrayContaining([
          `responsável vinculado: ${guardianId}`,
          'responsável desvinculado',
        ]),
      );
    });

    it('Dado o Profissional, Quando tenta vincular ou cadastrar responsável, Então é recusado', async () => {
      const { patient, professional } = await patientWithProfessional(true);
      signIn('profissional', CLINIC_A_ID, professional.id);
      const actions = await cadastro();

      const link = await actions.linkPatientGuardian({
        patientId: patient.id,
        guardianId: 'g-1',
      });
      const create = await actions.createGuardian({
        fullName: 'Fulano',
        relationship: 'pai',
        phone: '11999990000',
      });

      expect(link.success).toBe(false);
      expect(create.success).toBe(false);
    });
  });

  describe('Scenario: consentimento do parceiro', () => {
    async function referredPatient() {
      const r = await repos();
      const partner = Partner.create({
        fullName: 'Parceiro A',
        email: `${crypto.randomUUID()}@parceiro.com`,
        phone: '11999990000',
      });
      await r.partners.save(partner);
      const patient = buildPatient({ referredByPartnerId: partner.id });
      await r.patients.save(patient);
      return { patient, partner };
    }

    it('Dado a atendente, Quando lança o consentimento em papel duas vezes, Então grava uma vez e audita a criação', async () => {
      const { patient } = await referredPatient();
      signIn('atendente');
      const { registerPaperConsent } = await consentimento();

      const first = await registerPaperConsent({ patientId: patient.id });
      const second = await registerPaperConsent({ patientId: patient.id });

      expect(first.data?.created).toBe(true);
      expect(second.data?.created).toBe(false);
      const records = await (
        await repos()
      ).partnerShareConsents.findByPatientId(patient.id);
      expect(records).toHaveLength(1);
      expect(records[0]?.ipAddress).toBe('203.0.113.9');
      const events = (await auditOf('partner-consent')).filter(
        (e) => e.patientId === patient.id,
      );
      expect(events.map((e) => e.action).sort()).toEqual(['create', 'update']);
    });

    it('Dado o Profissional vinculado, Quando tenta lançar o papel, Então é recusado; e consegue revogar', async () => {
      const { patient, partner } = await referredPatient();
      const r = await repos();
      const professional = buildProfessional();
      await r.professionals.save(professional);
      await r.professionalPatientLinks.ensureLink(professional.id, patient.id);
      signIn('atendente');
      await (await consentimento()).registerPaperConsent({
        patientId: patient.id,
      });
      signIn('profissional', CLINIC_A_ID, professional.id);
      const { registerPaperConsent, revokePartnerConsent } =
        await consentimento();

      const paper = await registerPaperConsent({ patientId: patient.id });
      const revoked = await revokePartnerConsent({ patientId: patient.id });

      expect(paper.success).toBe(false);
      expect(revoked.success).toBe(true);
      const records = await r.partnerShareConsents.findByPatientId(patient.id);
      expect(records).toHaveLength(2);
      const details = (await auditOf('partner-consent')).map((e) => e.detail);
      expect(details).toContain(
        `revogação pela equipe; parceiro ${partner.id}`,
      );
    });

    it('Dado paciente sem parceiro indicador, Quando lança o papel, Então responde erro e nada é gravado', async () => {
      const { patient } = await patientWithProfessional(false);
      signIn('atendente');
      const { registerPaperConsent } = await consentimento();

      const result = await registerPaperConsent({ patientId: patient.id });

      expect(result.success).toBe(false);
      expect(
        await (await repos()).partnerShareConsents.findByPatientId(patient.id),
      ).toHaveLength(0);
    });
  });
});
