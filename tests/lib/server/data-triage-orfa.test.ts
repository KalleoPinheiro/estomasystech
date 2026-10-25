import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { buildTriageQueue } from '@/lib/server/data/triage';

const photo = (id: string, conditionId: string) => ({
  id,
  conditionId,
  patientNote: null,
  createdAt: new Date(Date.now() - 3 * 3_600_000),
});

vi.mock('@/infrastructure/container', () => ({
  getRepositories: async () => ({
    conditionPhotos: {
      findPendingTriage: async () => [
        photo('foto-orfa', 'cond-inexistente'),
        photo('foto-sem-paciente', 'cond-1'),
      ],
    },
    conditions: {
      findByIds: async () => [
        {
          id: 'cond-1',
          patientId: 'pac-sumiu',
          title: 'Ferida X',
          kind: 'wound',
        },
      ],
    },
    patients: { findByIds: async () => [] },
    assessments: { findByConditionIds: async () => [] },
  }),
}));

describe('Feature: fila de triagem com dado órfão (defesa de leitura, #548)', () => {
  it('Dado uma foto sem condição e outra cujo paciente não vem, Quando monta a fila, Então mostra o traço no lugar do nome e não quebra', async () => {
    const queue = await buildTriageQueue(
      {
        role: 'company_admin',
        subject: 'a@c.com',
        clinicId: 'c',
        professionalId: null,
      } as unknown as Session,
      () => true,
    );

    expect(queue).toEqual([
      expect.objectContaining({
        id: 'foto-orfa',
        conditionTitle: '—',
        patientId: null,
        patientName: '—',
        latestScore: null,
        infectionAlert: null,
        waitingHours: 3,
      }),
      expect.objectContaining({
        id: 'foto-sem-paciente',
        conditionTitle: 'Ferida X',
        patientId: 'pac-sumiu',
        patientName: '—',
      }),
    ]);
  });
});
