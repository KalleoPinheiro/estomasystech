// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlatformAuditPage from '@/app/plataforma/auditoria/page';
import PlatformClinicPage from '@/app/plataforma/clinicas/[id]/page';
import PlatformMyAccountLayout from '@/app/plataforma/minha-conta/layout';
import PlatformPage from '@/app/plataforma/page';
import { renderWithToast } from '../support/render-with-toast';
import { resolveServerTree } from '../support/server-page';

const mocks = vi.hoisted(() => ({
  requirePlatformPage: vi.fn(),
  listPlatformClinics: vi.fn(),
  loadPlatformClinicDetail: vi.fn(),
  listPlatformClinicAdmins: vi.fn(),
  listPlatformAuditFor: vi.fn(),
  prefetchSettings: vi.fn(),
}));

vi.mock('@/lib/server/session', () => ({
  requirePlatformPage: mocks.requirePlatformPage,
}));
vi.mock('@/lib/server/data/platform', () => ({
  listPlatformClinics: mocks.listPlatformClinics,
  loadPlatformClinicDetail: mocks.loadPlatformClinicDetail,
  listPlatformClinicAdmins: mocks.listPlatformClinicAdmins,
  listPlatformAuditFor: mocks.listPlatformAuditFor,
}));
vi.mock('@/lib/server/data/settings-prefetch', () => ({
  prefetchSettings: mocks.prefetchSettings,
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'c1' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/plataforma',
}));

const SESSION = { role: 'super_admin', subject: 'dono@estomasystech.app' };

const envelope = (data: unknown, ok = true, error: string | null = null) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => ({ success: ok, data, error, meta: { nextCursor: null } }),
});

const summary = {
  id: 'a',
  name: 'Clínica Lida No Servidor',
  cnpj: '12.345.678/0001-95',
  registrationComplete: true,
  status: 'active',
  adminStatus: 'active',
  emailChannel: {
    configured: false,
    provider: null,
    lastStatus: null,
    lastStatusAt: null,
  },
  createdAt: '2026-09-27T00:00:00.000Z',
};

const renderServer = async (element: Promise<ReactElement>) =>
  renderWithToast((await resolveServerTree(await element)) as ReactElement);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Feature: Plataforma chega com os dados no HTML (#558)', () => {
  it('Dado o super_admin, Quando abre /plataforma, Então a guarda roda e a lista aparece sem chamar /api', async () => {
    mocks.requirePlatformPage.mockResolvedValue(SESSION);
    mocks.listPlatformClinics.mockResolvedValue([summary]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await renderServer(PlatformPage());

    expect(mocks.requirePlatformPage).toHaveBeenCalledOnce();
    expect(mocks.listPlatformClinics).toHaveBeenCalledWith(SESSION);
    expect(
      screen.getByRole('link', { name: 'Clínica Lida No Servidor' }),
    ).toHaveAttribute('href', '/plataforma/clinicas/a');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dada falha ao ler a lista no servidor, Quando abre /plataforma, Então a tela busca por /api e mostra o erro', async () => {
    mocks.requirePlatformPage.mockResolvedValue(SESSION);
    mocks.listPlatformClinics.mockRejectedValue(new Error('Banco fora do ar'));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(envelope(null, false, 'Banco fora do ar'));
    vi.stubGlobal('fetch', fetchMock);

    await renderServer(PlatformPage());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Banco fora do ar',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/platform/clinics',
      expect.anything(),
    );
  });

  it('Dado o detalhe lido no servidor, Quando abre a clínica, Então o cadastro aparece sem chamar /api', async () => {
    mocks.requirePlatformPage.mockResolvedValue(SESSION);
    mocks.loadPlatformClinicDetail.mockResolvedValue({
      ...summary,
      id: 'c1',
      name: 'Clínica Detalhada',
      contactPhone: null,
      contactEmail: null,
      address: null,
      city: null,
      professionalName: null,
      professionalRegistry: null,
      statusChangedAt: null,
      statusChangedBy: null,
      statusReason: null,
      statusReasonNote: null,
    });
    mocks.listPlatformClinicAdmins.mockResolvedValue([]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await renderServer(
      PlatformClinicPage({ params: Promise.resolve({ id: 'c1' }) }),
    );

    expect(mocks.loadPlatformClinicDetail).toHaveBeenCalledWith('c1');
    expect(mocks.listPlatformClinicAdmins).toHaveBeenCalledWith('c1');
    expect(
      screen.getByRole('heading', { level: 1, name: /Clínica Detalhada/ }),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dada clínica que não existe, Quando abre o detalhe, Então a tela busca e mostra «Clínica não encontrada»', async () => {
    mocks.requirePlatformPage.mockResolvedValue(SESSION);
    mocks.loadPlatformClinicDetail.mockResolvedValue(null);
    mocks.listPlatformClinicAdmins.mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
          data: null,
          error: 'Clínica não encontrada',
        }),
      }),
    );

    await renderServer(
      PlatformClinicPage({ params: Promise.resolve({ id: 'c1' }) }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Clínica não encontrada',
    );
  });

  it('Dada a trilha lida no servidor, Quando abre a Auditoria, Então a 1ª página aparece sem chamar /api', async () => {
    mocks.requirePlatformPage.mockResolvedValue(SESSION);
    mocks.listPlatformAuditFor.mockResolvedValue({
      events: [
        {
          id: 'e1',
          clinicId: null,
          clinicName: null,
          actorRole: 'super_admin',
          actorId: 'dono@estomasystech.app',
          action: 'update',
          resourceType: 'clinic-info',
          resourceId: 'c1',
          detail: null,
          occurredAt: '2026-09-27T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await renderServer(PlatformAuditPage());

    expect(mocks.listPlatformAuditFor).toHaveBeenCalledWith(SESSION, {
      limit: 100,
    });
    expect(await screen.findByText('Plataforma')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dada falha ao ler a trilha no servidor, Quando abre a Auditoria, Então a tela busca por /api', async () => {
    mocks.requirePlatformPage.mockResolvedValue(SESSION);
    mocks.listPlatformAuditFor.mockRejectedValue(new Error('falhou'));
    const fetchMock = vi.fn().mockResolvedValue(envelope([]));
    vi.stubGlobal('fetch', fetchMock);

    await renderServer(PlatformAuditPage());

    expect(
      await screen.findByText('Nenhum evento de plataforma registrado.'),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('Dado o super_admin, Quando abre Minha conta, Então a guarda roda e a conta já vem lida do servidor', async () => {
    mocks.requirePlatformPage.mockResolvedValue(SESSION);
    mocks.prefetchSettings.mockResolvedValue({
      '/api/me': {
        email: 'dono@estomasystech.app',
        role: 'super_admin',
        mfa: { policy: 'required', enrolled: true },
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { OwnAccountPanel } = await import('@/components/own-account-panel');

    await renderServer(
      PlatformMyAccountLayout({ children: <OwnAccountPanel /> }),
    );

    expect(mocks.prefetchSettings).toHaveBeenCalledWith(SESSION, 'minha-conta');
    expect(await screen.findByText('dono@estomasystech.app')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
