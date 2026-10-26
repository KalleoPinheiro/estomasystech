import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';

const repositories = vi.hoisted(() => ({
  professionals: { findAll: vi.fn(), findById: vi.fn() },
  producedSessions: { findCompletedInRange: vi.fn() },
  commissionPayouts: { findAll: vi.fn(), findPaidItems: vi.fn() },
}));

vi.mock('@/infrastructure/container', () => ({
  getRepositories: async () => repositories,
}));

import { getClinicPayoutsFor } from '@/lib/server/data/payouts';

describe('Feature: livro de repasses da clínica (#547)', () => {
  it('Dado um repasse de profissional que não está mais no cadastro, Quando o Admin lê o livro, Então o histórico mostra «—» no lugar do nome', async () => {
    repositories.professionals.findAll.mockResolvedValue([]);
    repositories.commissionPayouts.findPaidItems.mockResolvedValue([]);
    repositories.producedSessions.findCompletedInRange.mockResolvedValue([]);
    repositories.commissionPayouts.findAll.mockResolvedValue([
      {
        id: 'repasse-1',
        professionalId: 'prof-removido',
        period: '2020-02',
        items: [],
        totalCents: 0,
        paidAt: new Date('2020-03-02T12:00:00Z'),
        paymentMethod: 'pix',
        cancelledAt: null,
        cancelReason: null,
        createdAt: new Date('2020-03-02T12:00:00Z'),
      },
    ]);

    const result = await getClinicPayoutsFor(
      { role: 'company_admin', clinicId: 'clinica-a' } as unknown as Session,
      '2020-02',
    );

    expect(result.history).toHaveLength(1);
    expect(result.history[0]?.professionalName).toBe('—');
  });
});
