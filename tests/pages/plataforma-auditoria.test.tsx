// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlatformAuditPage from '@/app/plataforma/auditoria/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/plataforma/auditoria',
}));

const envelope = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data, error: null }),
});

const row = (overrides: Record<string, unknown>) => ({
  id: 'e1',
  clinicId: null,
  clinicName: null,
  actorRole: 'anonymous',
  actorId: 'x@y.test',
  action: 'read',
  resourceType: 'session',
  resourceId: 'x@y.test',
  detail: 'invalid_credentials',
  occurredAt: '2026-09-27T12:00:00.000Z',
  ...overrides,
});

describe('Feature: Tela da trilha da plataforma (B6)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Dados eventos de plataforma e de clínica, Quando abrir a trilha da plataforma, Então mostra Plataforma ou o nome da clínica e os rótulos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope([
        row({ id: 'e1' }),
        row({
          id: 'e2',
          clinicId: 'c1',
          clinicName: 'Clínica Sol',
          actorRole: 'super_admin',
          actorId: 'dono@vitta.app',
          action: 'create',
          resourceType: 'clinic-info',
          detail: null,
        }),
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<PlatformAuditPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Trilha da plataforma' }),
    ).toBeInTheDocument();
    const platformRow = (
      await screen.findByText('invalid_credentials')
    ).closest('tr') as HTMLElement;
    expect(within(platformRow).getByText('Plataforma')).toBeInTheDocument();
    const clinicRow = screen
      .getByText('Clínica Sol')
      .closest('tr') as HTMLElement;
    expect(within(clinicRow).getByText('Criação')).toBeInTheDocument();
    expect(within(clinicRow).getByText('Dados da clínica')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/platform/audit?limit=100&offset=0',
    );
  });

  it('Dada trilha vazia, Quando abrir a trilha da plataforma, Então mostra a mensagem de vazio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope([])));

    render(<PlatformAuditPage />);

    expect(
      await screen.findByText('Nenhum evento de plataforma registrado.'),
    ).toBeInTheDocument();
  });
});
