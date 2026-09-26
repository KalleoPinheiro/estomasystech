// @vitest-environment jsdom

import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import PatientRecordPage from '@/app/(staff)/pacientes/[id]/page';
import type { UserRole } from '@/domain/auth/user-role';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

const patient = {
  id: 'pac-1',
  fullName: 'Maria Souza',
  email: 'maria@example.com',
  phone: '11988887777',
  birthDate: null,
  notes: null,
  referredByPartnerId: null,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const CLINICAL = /\/(anamnesis|conditions|evolutions|care-plans)$/;

function mockApi(role: UserRole) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/auth/identity')) return ok(identityFor(role));
    if (url === '/api/patients/pac-1') return ok(patient);
    if (CLINICAL.test(url)) return ok(url.endsWith('anamnesis') ? null : []);
    if (url.startsWith('/api/packages')) return ok([]);
    if (url.startsWith('/api/procedures')) return ok([]);
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const renderAs = async (role: UserRole) => {
  const fetchMock = mockApi(role);
  await act(async () => {
    renderWithToast(
      <WithStaffIdentity>
        <PatientRecordPage params={Promise.resolve({ id: 'pac-1' })} />
      </WithStaffIdentity>,
    );
  });
  await screen.findByText('Maria Souza');
  return fetchMock;
};

/** Issue #199: o Atendente via 4 chamadas 403 e alerta de erro na ficha. */
describe('Feature: ficha do paciente por papel (#199)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('C39 atendente não vê abas clínicas', async () => {
    const fetchMock = await renderAs('atendente');

    expect(
      await screen.findByText(/seções clínicas do prontuário são restritas/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls.filter((u) => CLINICAL.test(u))).toEqual([]);
  });

  it('profissional vê as abas clínicas, sem a de pacotes', async () => {
    await renderAs('profissional');

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Anamnese' })).toBeInTheDocument(),
    );
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.queryByRole('tab', { name: 'Pacotes' })).toBeNull();
  });

  it('admin vê as cinco abas', async () => {
    await renderAs('company_admin');

    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(5));
  });
});
