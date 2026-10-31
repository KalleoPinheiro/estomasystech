import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@/domain/shared/errors';
import type { Session } from '@/lib/auth/session';

const repos = vi.hoisted(() => ({ clinics: { findById: vi.fn() } }));
vi.mock('@/infrastructure/container', () => ({
  getRepositories: async () => repos,
}));
vi.mock('@/lib/dto', () => ({
  toClinicInfoDto: (clinic: { name: string }) => ({ name: clinic.name }),
}));
vi.mock('@/lib/legal-text', () => ({
  controllerFromClinic: (clinic: { name: string }) => ({
    controller: clinic.name,
  }),
}));

import {
  getClinicInfoFor,
  getLegalControllerFor,
} from '@/lib/server/data/clinic-info';

const session = {
  role: 'atendente',
  clinicId: 'clinica-a',
} as unknown as Session;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Feature: cabeçalho e encarregado dos documentos impressos (#546)', () => {
  it('Dada a clínica cadastrada, Quando ler o cabeçalho, Então traz os dados dela', async () => {
    repos.clinics.findById.mockResolvedValue({ name: 'Clínica Aurora' });

    expect(await getClinicInfoFor(session)).toEqual({ name: 'Clínica Aurora' });
    expect(repos.clinics.findById).toHaveBeenCalledWith('clinica-a');
  });

  it('Dada clínica sem registro (defensivo), Quando ler o cabeçalho, Então usa o nome neutro e sem CNPJ', async () => {
    repos.clinics.findById.mockResolvedValue(null);

    const info = await getClinicInfoFor(session);

    expect(info.name).toMatch(/EstomaSysTech/);
    expect(info.cnpj).toBeNull();
  });

  it('Dada a clínica cadastrada, Quando ler o encarregado, Então devolve o controlador dos termos', async () => {
    repos.clinics.findById.mockResolvedValue({ name: 'Clínica Aurora' });

    expect(await getLegalControllerFor(session)).toEqual({
      controller: 'Clínica Aurora',
    });
  });

  it('Dada clínica sem registro, Quando ler o encarregado, Então 404', async () => {
    repos.clinics.findById.mockResolvedValue(null);

    await expect(getLegalControllerFor(session)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
