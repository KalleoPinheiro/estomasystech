import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@/domain/shared/errors';
import {
  assertClinicalResourceAccessible,
  type ClinicalResourceRepositories,
  linkedPatientFilter,
  resolveClinicalResourcePatientId,
} from '@/lib/auth/clinical-resource-scope';
import type { Session } from '@/lib/auth/session';

/**
 * Cadeia recurso→paciente do R4 (#186) com repositórios em memória:
 * condição → paciente; foto → condição → paciente; plano → paciente;
 * intervenção/resultado → plano → paciente.
 */

const PATIENT = 'pac-1';

function fakeRepositories(
  linkedPatientIds: string[] = [],
): ClinicalResourceRepositories {
  const conditions = new Map([
    ['cond-1', { id: 'cond-1', patientId: PATIENT }],
  ]);
  const photos = new Map([
    ['foto-1', { id: 'foto-1', conditionId: 'cond-1' }],
    ['foto-orfa', { id: 'foto-orfa', conditionId: 'cond-x' }],
  ]);
  const plans = new Map([['plano-1', { id: 'plano-1', patientId: PATIENT }]]);
  const interventions = new Map([
    ['int-1', { id: 'int-1', carePlanId: 'plano-1' }],
  ]);
  const outcomes = new Map([['res-1', { id: 'res-1', carePlanId: 'plano-1' }]]);
  const find =
    <T>(map: Map<string, T>) =>
    async (id: string) =>
      map.get(id) ?? null;

  return {
    conditions: { findById: vi.fn(find(conditions)) },
    conditionPhotos: { findById: vi.fn(find(photos)) },
    carePlans: { findById: vi.fn(find(plans)) },
    carePlanInterventions: { findById: vi.fn(find(interventions)) },
    carePlanOutcomes: { findById: vi.fn(find(outcomes)) },
    professionalPatientLinks: {
      hasLink: vi.fn(async (_professionalId: string, patientId: string) =>
        linkedPatientIds.includes(patientId),
      ),
      findLinkedPatientIds: vi.fn(async () => linkedPatientIds),
    },
  } as unknown as ClinicalResourceRepositories;
}

const session = (
  role: Session['role'],
  professionalId: string | null = 'prof-1',
): Session => ({
  expiresAtMs: Date.now() + 60_000,
  subject: `${role}@x.com`,
  role,
  clinicId: 'clinic-a',
  professionalId,
});

describe('Feature: resolução recurso→paciente (R4, #186)', () => {
  it.each([
    ['condition', 'cond-1'],
    ['photo', 'foto-1'],
    ['carePlan', 'plano-1'],
    ['carePlanIntervention', 'int-1'],
    ['carePlanOutcome', 'res-1'],
  ] as const)(
    'Dado %s existente, Quando resolver, Então devolve o paciente dono',
    async (kind, id) => {
      await expect(
        resolveClinicalResourcePatientId(kind, id, fakeRepositories()),
      ).resolves.toBe(PATIENT);
    },
  );

  it.each([
    ['condition', 'nao-existe'],
    ['photo', 'nao-existe'],
    ['photo', 'foto-orfa'],
    ['carePlan', 'nao-existe'],
    ['carePlanIntervention', 'nao-existe'],
    ['carePlanOutcome', 'nao-existe'],
  ] as const)(
    'Dado %s "%s" sem cadeia até o paciente, Quando resolver, Então null',
    async (kind, id) => {
      await expect(
        resolveClinicalResourcePatientId(kind, id, fakeRepositories()),
      ).resolves.toBeNull();
    },
  );
});

describe('Feature: assertClinicalResourceAccessible', () => {
  it('Dado não-profissional, Quando checar, Então passa sem consultar repositório', async () => {
    const repos = fakeRepositories();

    for (const role of ['company_admin', 'super_admin', 'atendente'] as const) {
      await expect(
        assertClinicalResourceAccessible(
          session(role),
          'condition',
          'x',
          repos,
        ),
      ).resolves.toBeUndefined();
    }
    await expect(
      assertClinicalResourceAccessible(null, 'condition', 'x', repos),
    ).resolves.toBeUndefined();
    expect(repos.conditions.findById).not.toHaveBeenCalled();
  });

  it('Dado profissional com vínculo, Quando checar, Então passa', async () => {
    await expect(
      assertClinicalResourceAccessible(
        session('profissional'),
        'carePlanOutcome',
        'res-1',
        fakeRepositories([PATIENT]),
      ),
    ).resolves.toBeUndefined();
  });

  it('Dado profissional sem vínculo, Quando checar, Então NotFoundError cujo texto cita o recurso, nunca o paciente', async () => {
    const error = await assertClinicalResourceAccessible(
      session('profissional'),
      'photo',
      'foto-1',
      fakeRepositories([]),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as Error).message).toContain('foto-1');
    expect((error as Error).message).not.toContain(PATIENT);
  });

  it('Dado profissional, Quando recurso inexistente, Então NotFoundError', async () => {
    await expect(
      assertClinicalResourceAccessible(
        session('profissional'),
        'carePlan',
        'nao-existe',
        fakeRepositories([PATIENT]),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Dado profissional sem professionalId, Quando checar, Então NotFoundError', async () => {
    await expect(
      assertClinicalResourceAccessible(
        session('profissional', null),
        'condition',
        'cond-1',
        fakeRepositories([PATIENT]),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('Feature: linkedPatientFilter', () => {
  it('Dado não-profissional, Quando filtrar, Então aceita qualquer paciente sem consultar vínculo', async () => {
    const repos = fakeRepositories();
    const accepts = await linkedPatientFilter(
      session('company_admin'),
      repos.professionalPatientLinks,
    );

    expect(accepts('qualquer')).toBe(true);
    expect(
      repos.professionalPatientLinks.findLinkedPatientIds,
    ).not.toHaveBeenCalled();
  });

  it('Dado profissional, Quando filtrar, Então aceita só vinculados', async () => {
    const repos = fakeRepositories([PATIENT]);
    const accepts = await linkedPatientFilter(
      session('profissional'),
      repos.professionalPatientLinks,
    );

    expect(accepts(PATIENT)).toBe(true);
    expect(accepts('outro')).toBe(false);
  });

  it('Dado profissional sem professionalId, Quando filtrar, Então recusa todos', async () => {
    const repos = fakeRepositories([PATIENT]);
    const accepts = await linkedPatientFilter(
      session('profissional', null),
      repos.professionalPatientLinks,
    );

    expect(accepts(PATIENT)).toBe(false);
  });
});
