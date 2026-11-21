import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';

const repos = vi.hoisted(() => ({
  carePlans: {},
  carePlanDiagnoses: {},
  carePlanOutcomes: {},
  carePlanInterventions: {},
  outcomeEvaluations: {},
  interventionRecords: {},
  nursingDiagnoses: { findByCodes: vi.fn() },
  nursingOutcomes: { findByCodes: vi.fn() },
  nursingInterventions: { findByCodes: vi.fn() },
  auditEvents: {},
}));
const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  executeInput: vi.fn(),
  assertAccessible: vi.fn(),
  recordAudit: vi.fn(),
  toDetail: vi.fn((detail: unknown, catalogs: unknown) => ({
    detail,
    catalogs,
  })),
}));

vi.mock('@/infrastructure/container', () => ({
  getRepositories: async () => repos,
}));
vi.mock('@/application/clinical/get-care-plan', () => ({
  GetCarePlan: class {
    execute = (input: unknown) => {
      mocks.executeInput(input);
      return mocks.execute(input);
    };
  },
}));
vi.mock('@/lib/audit', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/lib/auth/clinical-resource-scope', () => ({
  assertClinicalResourceAccessible: mocks.assertAccessible,
}));
vi.mock('@/lib/dto', () => ({ toCarePlanDetailDto: mocks.toDetail }));

import { getCarePlanDetailFor } from '@/lib/server/data/care-plan';

const session = { role: 'profissional', clinicId: 'a' } as unknown as Session;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertAccessible.mockResolvedValue(undefined);
});

describe('Feature: plano com diagnóstico da clínica ou digitado (#954)', () => {
  it('Dado diagnósticos com título no plano ou sem código, Quando ler, Então só busca no catálogo global o que veio dele', async () => {
    mocks.execute.mockResolvedValue({
      plan: { patientId: 'pac-1' },
      diagnoses: [
        { diagnosisCode: 'D1', diagnosisLabel: null },
        { diagnosisCode: 'D2', diagnosisLabel: 'Da clínica' },
        { diagnosisCode: null, diagnosisLabel: 'Digitado' },
      ],
      outcomes: [],
      interventions: [],
    });
    repos.nursingDiagnoses.findByCodes.mockResolvedValue([]);
    repos.nursingOutcomes.findByCodes.mockResolvedValue([]);
    repos.nursingInterventions.findByCodes.mockResolvedValue([]);

    await getCarePlanDetailFor(session, 'plan-1');

    expect(repos.nursingDiagnoses.findByCodes).toHaveBeenCalledWith(['D1']);
  });
});
