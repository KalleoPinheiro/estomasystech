import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { listMajorityReviewsFor } from '@/lib/server/data/majority';

vi.mock('@/infrastructure/container', () => ({
  getRepositories: async () => ({}),
}));
vi.mock('@/application/guardians/majority-review', () => ({
  listMajorityReviews: async () => [
    {
      patient: { id: 'p-1', fullName: 'Ana Maior', birthDate: null },
      guardianName: 'Mãe',
      guardianRelationship: 'mãe',
      awaitingTransfer: true,
      representativeConsentExpiresOn: null,
      representativeConsentExpired: false,
    },
    {
      patient: {
        id: 'p-2',
        fullName: 'Bia Maior',
        birthDate: new Date('2008-01-02T00:00:00Z'),
      },
      guardianName: 'Pai',
      guardianRelationship: 'pai',
      awaitingTransfer: false,
      representativeConsentExpiresOn: new Date('2026-12-01T00:00:00Z'),
      representativeConsentExpired: false,
    },
  ],
}));

describe('Feature: revisão de maioridade lida no servidor (#372, #548)', () => {
  it('Dado revisões com e sem data, Quando o admin lê, Então as datas viram texto ISO ou nulo', async () => {
    const result = await listMajorityReviewsFor({
      role: 'company_admin',
      email: 'x@clinica.com',
      clinicId: 'clinic-a',
      professionalId: null,
    } as Session);

    expect(result.map((r) => [r.patientId, r.birthDate])).toEqual([
      ['p-1', null],
      ['p-2', '2008-01-02T00:00:00.000Z'],
    ]);
    expect(result[1]?.representativeConsentExpiresOn).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });

  it('Dado o papel profissional, Quando lê, Então é recusado', async () => {
    await expect(
      listMajorityReviewsFor({
        role: 'profissional',
        email: 'x@clinica.com',
        clinicId: 'clinic-a',
        professionalId: null,
      } as Session),
    ).rejects.toThrow();
  });
});
