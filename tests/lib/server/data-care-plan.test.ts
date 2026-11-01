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

describe('Feature: plano de cuidados lido no servidor para o documento (#546)', () => {
  it('Dado plano com diagnóstico, resultado e intervenção, Quando ler, Então busca os catálogos pelos códigos, audita a leitura e monta o DTO', async () => {
    mocks.execute.mockResolvedValue({
      plan: { patientId: 'pac-1' },
      diagnoses: [{ diagnosisCode: 'D1' }],
      outcomes: [{ outcome: { outcomeCode: 'O1' } }],
      interventions: [{ intervention: { interventionCode: 'I1' } }],
    });
    repos.nursingDiagnoses.findByCodes.mockResolvedValue([{ code: 'D1' }]);
    repos.nursingOutcomes.findByCodes.mockResolvedValue([{ code: 'O1' }]);
    repos.nursingInterventions.findByCodes.mockResolvedValue([{ code: 'I1' }]);

    await getCarePlanDetailFor(session, 'plan-1');

    expect(mocks.assertAccessible).toHaveBeenCalledWith(
      session,
      'carePlan',
      'plan-1',
      repos,
    );
    expect(repos.nursingDiagnoses.findByCodes).toHaveBeenCalledWith(['D1']);
    expect(repos.nursingOutcomes.findByCodes).toHaveBeenCalledWith(['O1']);
    expect(repos.nursingInterventions.findByCodes).toHaveBeenCalledWith(['I1']);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      repos.auditEvents,
      session,
      expect.objectContaining({
        resourceType: 'care_plan',
        resourceId: 'plan-1',
        patientId: 'pac-1',
      }),
    );
    const catalogs = mocks.toDetail.mock.calls[0][1] as Record<
      string,
      Map<string, unknown>
    >;
    expect(catalogs.diagnoses.get('D1')).toEqual({ code: 'D1' });
    expect(catalogs.outcomes.get('O1')).toEqual({ code: 'O1' });
    expect(catalogs.interventions.get('I1')).toEqual({ code: 'I1' });
    expect(mocks.executeInput).toHaveBeenCalledWith({ id: 'plan-1' });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      repos.auditEvents,
      session,
      expect.objectContaining({ action: 'read' }),
    );
  });

  it('Dado Profissional sem vínculo (R4), Quando ler, Então o erro sobe e nada é lido nem auditado', async () => {
    mocks.assertAccessible.mockRejectedValue(new Error('404'));

    await expect(getCarePlanDetailFor(session, 'plan-1')).rejects.toThrow(
      '404',
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
