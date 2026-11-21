import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicNursingDiagnosis } from '@/domain/taxonomy/clinic-nursing-diagnosis';
import { InMemoryClinicDiagnosisRepository } from '@/infrastructure/persistence/in-memory/in-memory-taxonomy-repositories';
import type { Session } from '@/lib/auth/session';

const state = vi.hoisted(() => ({
  scopes: [] as unknown[],
  repo: null as unknown,
}));

vi.mock('@/infrastructure/container', () => ({
  getRepositories: async (scope: unknown) => {
    state.scopes.push(scope);
    return { clinicDiagnoses: state.repo };
  },
}));

import { listClinicDiagnosesFor } from '@/lib/server/data/clinic-diagnoses';

const session = (role: string) =>
  ({ role, clinicId: 'clinic-a' }) as unknown as Session;

beforeEach(() => {
  state.scopes = [];
  state.repo = new InMemoryClinicDiagnosisRepository();
});

describe('Feature: catálogo da clínica lido no servidor para Configurações (#954)', () => {
  it('Dado o Admin de Empresa, Quando ler, Então devolve a lista no escopo da sessão', async () => {
    const repo = state.repo as InMemoryClinicDiagnosisRepository;
    await repo.save(
      ClinicNursingDiagnosis.create({
        clinicId: 'clinic-a',
        label: 'Dor aguda',
      }),
    );

    const list = await listClinicDiagnosesFor(session('company_admin'));

    expect(list.map((item) => item.label)).toEqual(['Dor aguda']);
    expect(state.scopes).toEqual([{ clinicId: 'clinic-a' }]);
  });

  it('Dado papel sem acesso à seção, Quando ler, Então não consulta nem devolve nada', async () => {
    expect(await listClinicDiagnosesFor(session('atendente'))).toEqual([]);
    expect(state.scopes).toEqual([]);
  });
});
