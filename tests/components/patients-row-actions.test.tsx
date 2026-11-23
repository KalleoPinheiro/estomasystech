// @vitest-environment jsdom

import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientsClient } from '@/app/(staff)/pacientes/patients-client';
import type { PatientDto } from '@/lib/dto';
import { renderWithToast } from '../support/render-with-toast';

vi.mock('@/app/(staff)/pacientes/actions', () => ({
  createPatient: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/pacientes',
}));

const patient = (over: Partial<PatientDto>): PatientDto => ({
  id: 'p1',
  fullName: 'Maria da Silva',
  email: null,
  phone: '+5511999990000',
  phoneNeedsCorrection: false,
  cpfMasked: null,
  birthDate: null,
  notes: null,
  referredByPartnerId: null,
  guardianId: null,
  guardianPortalRevokedAt: null,
  active: true,
  anonymized: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

afterEach(cleanup);

describe('Lista de pacientes: ações da linha agrupadas (#971)', () => {
  it('Dado paciente ativo, Então Prontuário, Editar e Desativar ficam num só grupo, filho único da célula Ações', () => {
    renderWithToast(
      <PatientsClient
        initialPage={{ items: [patient({})], nextCursor: null }}
        partners={[]}
      />,
    );

    const group = screen.getByTestId('patient-row-actions');
    // No modo empilhado do Table (< 40rem) cada filho da célula vira uma linha; um só filho mantém as ações juntas.
    expect(group.parentElement?.children).toHaveLength(1);
    expect(group.className).toMatch(/\bflex\b/);
    expect(group.className).toMatch(/\bflex-wrap\b/);
    const scope = within(group);
    expect(scope.getByRole('link', { name: 'Prontuário' })).toBeTruthy();
    expect(scope.getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(scope.getByRole('button', { name: 'Desativar' })).toBeTruthy();
  });

  it('Dado paciente inativo, Então Reativar fica no mesmo grupo de Editar', () => {
    renderWithToast(
      <PatientsClient
        initialPage={{
          items: [patient({ id: 'p2', active: false })],
          nextCursor: null,
        }}
        partners={[]}
      />,
    );

    const scope = within(screen.getByTestId('patient-row-actions'));
    expect(scope.getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(scope.getByRole('button', { name: 'Reativar' })).toBeTruthy();
  });
});
