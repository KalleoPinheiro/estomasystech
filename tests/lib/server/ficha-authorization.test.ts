import { beforeAll, describe, expect, it } from 'vitest';
import { CreateCondition } from '@/application/clinical/create-condition';
import { OpenCarePlan } from '@/application/clinical/open-care-plan';
import { PrescribeIntervention } from '@/application/clinical/prescribe-intervention';
import { PrescribeOutcome } from '@/application/clinical/prescribe-outcome';
import { NotFoundError } from '@/domain/shared/errors';
import { NursingIntervention } from '@/domain/taxonomy/nursing-intervention';
import { NursingOutcome } from '@/domain/taxonomy/nursing-outcome';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import {
  authorizeClinicalResource,
  authorizePatientAccess,
} from '@/lib/server/ficha-authorization';
import { buildPatient, buildProfessional } from '../../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../../support/clinics';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const session = (
  role: Session['role'],
  clinicId: string,
  professionalId: string | null = null,
) =>
  ({
    role,
    subject: `${role}@clinica.com`,
    clinicId,
    professionalId,
  }) as unknown as Session;

/** Um paciente da clínica A com condição, plano, resultado e intervenção; o vínculo é opcional. */
async function seed(linked: boolean) {
  const repos = await getRepositories(clinicScope(CLINIC_A_ID));
  const professional = buildProfessional();
  await repos.professionals.save(professional);
  const patient = buildPatient();
  await repos.patients.save(patient);
  if (linked) {
    await repos.professionalPatientLinks.ensureLink(
      professional.id,
      patient.id,
    );
  }
  const condition = await new CreateCondition(
    repos.conditions,
    repos.patients,
  ).execute({
    patientId: patient.id,
    kind: 'wound',
    title: 'Lesão',
    stomaType: null,
    startedAt: null,
    notes: null,
  });
  const plan = await new OpenCarePlan(
    repos.carePlans,
    repos.patients,
    repos.conditions,
  ).execute({
    patientId: patient.id,
    conditionId: condition.id,
    professionalId: null,
  });
  const outcome = await new PrescribeOutcome(
    repos.carePlanOutcomes,
    repos.carePlans,
    repos.nursingOutcomes,
  ).execute({
    carePlanId: plan.id,
    outcomeCode: '9901',
    baselineScore: 1,
    targetScore: 3,
    deadline: null,
  });
  const intervention = await new PrescribeIntervention(
    repos.carePlanInterventions,
    repos.carePlans,
    repos.nursingInterventions,
  ).execute({
    carePlanId: plan.id,
    interventionCode: '9902',
    frequency: 'Diária',
    priority: 'alta',
  });
  return {
    patient,
    professional,
    ids: {
      condition: condition.id,
      carePlan: plan.id,
      carePlanOutcome: outcome.id,
      carePlanIntervention: intervention.id,
    },
  };
}

const KINDS = [
  'condition',
  'carePlan',
  'carePlanOutcome',
  'carePlanIntervention',
] as const;

beforeAll(async () => {
  await ensureTestClinics();
  const { nursingOutcomes, nursingInterventions } = await getRepositories(
    systemScope(),
  );
  await nursingOutcomes.save(
    NursingOutcome.create({
      code: '9901',
      label: 'Resultado de teste',
      domain: 'Saúde fisiológica',
      class: 'Integridade tissular',
      edition: 'NOC 6ª ed.',
      scaleAnchors: ['a', 'b', 'c', 'd', 'e'],
    }),
  );
  await nursingInterventions.save(
    NursingIntervention.create({
      code: '9902',
      label: 'Intervenção de teste',
      domain: 'Fisiológico: básico',
      class: 'Controle de pele/lesão',
      edition: 'NIC 7ª ed.',
    }),
  );
});

describe('Feature: autorização do recurso nas ações da ficha (R4, #552, ADR-080)', () => {
  describe('Scenario: ação endereçada pelo paciente', () => {
    it('Dado Profissional sem vínculo, Quando age sobre o paciente, Então é 404', async () => {
      const { patient, professional } = await seed(false);

      await expect(
        authorizePatientAccess(
          {
            session: session('profissional', CLINIC_A_ID, professional.id),
            scope: clinicScope(CLINIC_A_ID),
          },
          patient.id,
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('Dado Profissional vinculado ou Atendente, Quando age sobre o paciente, Então passa', async () => {
      const { patient, professional } = await seed(true);

      await expect(
        authorizePatientAccess(
          {
            session: session('profissional', CLINIC_A_ID, professional.id),
            scope: clinicScope(CLINIC_A_ID),
          },
          patient.id,
        ),
      ).resolves.toBeUndefined();
      await expect(
        authorizePatientAccess(
          {
            session: session('atendente', CLINIC_A_ID),
            scope: clinicScope(CLINIC_A_ID),
          },
          patient.id,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe.each(KINDS)('Scenario: ação endereçada pelo recurso %s', (kind) => {
    it('Dado Profissional sem vínculo com o paciente do recurso, Quando age, Então é 404', async () => {
      const { ids, professional } = await seed(false);

      await expect(
        authorizeClinicalResource(
          {
            session: session('profissional', CLINIC_A_ID, professional.id),
            scope: clinicScope(CLINIC_A_ID),
          },
          kind,
          ids[kind],
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('Dado Profissional vinculado, Quando age, Então passa', async () => {
      const { ids, professional } = await seed(true);

      await expect(
        authorizeClinicalResource(
          {
            session: session('profissional', CLINIC_A_ID, professional.id),
            scope: clinicScope(CLINIC_A_ID),
          },
          kind,
          ids[kind],
        ),
      ).resolves.toBeUndefined();
    });

    it('Dado Profissional de outra empresa, Quando age sobre recurso da clínica A, Então é 404 (o recurso não existe no escopo dele)', async () => {
      const { ids } = await seed(true);

      await expect(
        authorizeClinicalResource(
          {
            session: session('profissional', CLINIC_B_ID, 'prof-b'),
            scope: clinicScope(CLINIC_B_ID),
          },
          kind,
          ids[kind],
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it('Dado o Admin, Quando age sobre qualquer recurso, Então a autorização não consulta vínculo (o escopo da empresa barra no uso)', async () => {
    const { ids } = await seed(false);

    await expect(
      authorizeClinicalResource(
        {
          session: session('company_admin', CLINIC_A_ID),
          scope: clinicScope(CLINIC_A_ID),
        },
        'carePlan',
        ids.carePlan,
      ),
    ).resolves.toBeUndefined();
  });
});
