// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { IdentitySection } from '@/app/(staff)/configuracoes/identity-section';
import type { UserRole } from '@/domain/auth/user-role';
import { CLINIC_THEME_EVENT } from '@/lib/theme';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

function mockFetch(
  role: UserRole,
  clinicTheme?: { mode: string; accent: string },
  putResponse: () => unknown = () => ok({ theme: {} }),
) {
  const calls: { url: string; method: string; body: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: (init?.body as string) ?? null });
      if (url.startsWith('/api/auth/identity')) {
        return ok({
          ...identityFor(role),
          ...(clinicTheme ? { clinicTheme } : {}),
        });
      }
      if (url.startsWith('/api/settings/clinic-identity')) return putResponse();
      return ok(null);
    }),
  );
  return calls;
}

const renderSection = () =>
  renderWithToast(
    <WithStaffIdentity>
      <IdentitySection />
    </WithStaffIdentity>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Seção Identidade visual em Configurações (#426)', () => {
  it('Dado o Admin, Quando abrir sem escolha anterior, Então vê o padrão (seguir o aparelho, violeta) e pode salvar', async () => {
    mockFetch('company_admin');
    renderSection();

    const mode = (await screen.findByLabelText(
      'Tema padrão',
    )) as HTMLSelectElement;
    const accent = screen.getByLabelText('Cor') as HTMLSelectElement;

    expect(mode.value).toBe('system');
    expect(accent.value).toBe('violet');
    expect(mode.disabled).toBe(false);
    expect(
      screen.getByRole('button', { name: 'Salvar identidade visual' }),
    ).toBeTruthy();
    expect(Array.from(accent.options).map((o) => o.value)).toEqual([
      'cyan',
      'violet',
      'mint',
      'amber',
    ]);
  });

  it('Dado o Admin, Quando escolher escuro e âmbar e salvar, Então envia a escolha e o app é avisado na hora', async () => {
    const calls = mockFetch('company_admin');
    const received: unknown[] = [];
    window.addEventListener(CLINIC_THEME_EVENT, (e) =>
      received.push((e as CustomEvent).detail),
    );
    renderSection();

    fireEvent.change(await screen.findByLabelText('Tema padrão'), {
      target: { value: 'dark' },
    });
    fireEvent.change(screen.getByLabelText('Cor'), {
      target: { value: 'amber' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Salvar identidade visual' }),
    );

    await waitFor(() =>
      expect(received).toEqual([{ mode: 'dark', accent: 'amber' }]),
    );
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toBe('/api/settings/clinic-identity');
    expect(JSON.parse(put?.body ?? '{}')).toEqual({
      mode: 'dark',
      accent: 'amber',
    });
  });

  it('Dada a escolha atual gravada, Quando abrir, Então os campos mostram a escolha da clínica', async () => {
    mockFetch('company_admin', { mode: 'dark', accent: 'mint' });
    renderSection();

    expect(
      ((await screen.findByLabelText('Tema padrão')) as HTMLSelectElement)
        .value,
    ).toBe('dark');
    expect((screen.getByLabelText('Cor') as HTMLSelectElement).value).toBe(
      'mint',
    );
  });

  it('Dada a prévia, Quando trocar a cor e o modo, Então ela usa a cor e o modo escolhidos', async () => {
    mockFetch('company_admin');
    renderSection();
    fireEvent.change(await screen.findByLabelText('Cor'), {
      target: { value: 'cyan' },
    });
    fireEvent.change(screen.getByLabelText('Tema padrão'), {
      target: { value: 'dark' },
    });

    const preview = screen.getByTestId('identity-preview');

    expect(preview.getAttribute('data-accent')).toBe('cyan');
    expect(preview.getAttribute('data-theme')).toBe('dark');
  });

  it('Dada a prévia em "seguir o aparelho" num aparelho escuro, Então ela fica escura', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    mockFetch('company_admin');
    renderSection();

    await screen.findByLabelText('Tema padrão');

    await waitFor(() =>
      expect(
        screen.getByTestId('identity-preview').getAttribute('data-theme'),
      ).toBe('dark'),
    );
  });

  it.each(['atendente', 'profissional'] as const)(
    'Dado %s, Quando abrir, Então vê a escolha mas não edita',
    async (role) => {
      mockFetch(role, { mode: 'light', accent: 'cyan' });
      renderSection();

      const mode = (await screen.findByLabelText(
        'Tema padrão',
      )) as HTMLSelectElement;

      expect(mode.value).toBe('light');
      expect(mode.disabled).toBe(true);
      expect((screen.getByLabelText('Cor') as HTMLSelectElement).disabled).toBe(
        true,
      );
      expect(
        screen.queryByRole('button', { name: 'Salvar identidade visual' }),
      ).toBeNull();
      expect(screen.getByText(/Só o Admin de Empresa altera/)).toBeTruthy();
    },
  );

  it('Dado erro do servidor ao salvar, Quando o Admin salvar, Então mostra o erro e o app não muda', async () => {
    mockFetch('company_admin', undefined, () => ({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        data: null,
        error: 'Cor do tema inválida',
      }),
    }));
    const received: unknown[] = [];
    window.addEventListener(CLINIC_THEME_EVENT, (e) => received.push(e));
    renderSection();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Salvar identidade visual' }),
    );

    expect(
      (await screen.findAllByText('Cor do tema inválida')).length,
    ).toBeGreaterThan(0);
    expect(received).toEqual([]);
  });

  it('Dada falha ao ler a identidade, Quando abrir, Então avisa sem oferecer edição às cegas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ success: false, data: null, error: 'falhou' }),
      })),
    );
    renderSection();

    expect(
      await screen.findByText(/Não foi possível ler a identidade visual/),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Salvar identidade visual' }),
    ).toBeNull();
  });
});
