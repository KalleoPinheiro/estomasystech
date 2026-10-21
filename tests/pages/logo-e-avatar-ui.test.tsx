// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogoSection } from '@/app/(staff)/configuracoes/logo-section';
import { SidebarIdentity } from '@/app/(staff)/staff-layout-client';
import { OwnAccountPanel } from '@/components/own-account-panel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const respond = (routes: Record<string, unknown>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ success: true, data: routes[url], error: null }),
    })),
  );

const INFO = {
  name: 'Clínica Alfa',
  cnpj: null,
  address: null,
  city: null,
  professionalName: null,
  professionalRegistry: null,
};

describe('Feature: Logo e avatar nas telas (#427)', () => {
  describe('Cenário: Configurações → Logo da clínica', () => {
    it('Dada clínica com logo, Quando abrir, Então mostra a logo com o nome da clínica como alt', async () => {
      respond({
        '/api/settings/clinic-info': {
          info: INFO,
          identity: {
            logoUrl: '/api/clinic/logo?v=a',
            imageUploadAvailable: true,
          },
        },
      });

      render(<LogoSection />);

      expect(
        (await screen.findByAltText('Clínica Alfa')).getAttribute('src'),
      ).toContain('/api/clinic/logo');
      expect(
        (screen.getByLabelText('Enviar logo') as HTMLInputElement).disabled,
      ).toBe(false);
    });

    it('Dada clínica sem logo, Quando abrir, Então mostra as iniciais', async () => {
      respond({
        '/api/settings/clinic-info': {
          info: INFO,
          identity: { logoUrl: null, imageUploadAvailable: true },
        },
      });

      render(<LogoSection />);

      expect(
        (await screen.findByRole('img', { name: 'Clínica Alfa' })).textContent,
      ).toBe('CA');
    });

    it('Dado armazenamento indisponível, Quando abrir, Então o campo vem desabilitado com aviso', async () => {
      respond({
        '/api/settings/clinic-info': {
          info: INFO,
          identity: { logoUrl: null, imageUploadAvailable: false },
        },
      });

      render(<LogoSection />);

      expect(
        (await screen.findByText(/envio de imagens está indisponível/))
          .textContent,
      ).toContain('armazenamento não configurado');
      expect(
        (screen.getByLabelText('Enviar logo') as HTMLInputElement).disabled,
      ).toBe(true);
    });

    it('Dado servidor antigo sem o bloco identity, Quando abrir, Então segue habilitado e sem logo', async () => {
      respond({ '/api/settings/clinic-info': { info: INFO } });

      render(<LogoSection />);

      await screen.findByRole('img', { name: 'Clínica Alfa' });
      expect(
        (screen.getByLabelText('Enviar logo') as HTMLInputElement).disabled,
      ).toBe(false);
    });

    it('Dada falha ao carregar, Quando abrir, Então mostra o erro', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status: 500,
          json: async () => ({
            success: false,
            data: null,
            error: 'Erro ao carregar',
          }),
        })),
      );

      render(<LogoSection />);

      expect((await screen.findByRole('alert')).textContent).toContain(
        'Erro ao carregar',
      );
    });
  });

  describe('Cenário: Minha conta → Foto', () => {
    const ME = {
      email: 'ana.souza@clinica.com',
      role: 'atendente',
      mfa: { policy: 'optional', enrolled: false },
    };

    it('Dada conta com avatar, Quando abrir, Então mostra a foto (alt vazio)', async () => {
      respond({
        '/api/me': {
          ...ME,
          avatarUrl: '/api/account/avatar/1?v=a',
          imageUploadAvailable: true,
        },
      });

      const { container } = render(<OwnAccountPanel />);

      await waitFor(() =>
        expect(container.querySelector('img')).not.toBeNull(),
      );
      expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
    });

    it('Dada conta sem avatar, Quando abrir, Então o seletor de foto aparece habilitado', async () => {
      respond({ '/api/me': ME });

      render(<OwnAccountPanel />);

      expect(
        ((await screen.findByLabelText('Enviar foto')) as HTMLInputElement)
          .disabled,
      ).toBe(false);
    });

    it('Dado armazenamento indisponível, Quando abrir, Então o seletor de foto vem desabilitado', async () => {
      respond({ '/api/me': { ...ME, imageUploadAvailable: false } });

      render(<OwnAccountPanel />);

      expect(
        ((await screen.findByLabelText('Enviar foto')) as HTMLInputElement)
          .disabled,
      ).toBe(true);
    });
  });

  describe('Cenário: menu da equipe', () => {
    it('Dada identidade com logo e avatar, Quando renderizar o menu, Então mostra ambos', async () => {
      respond({
        '/api/auth/identity': {
          clinicLabel: 'Clínica Alfa',
          clinicLogoUrl: '/api/clinic/logo?v=a',
          account: {
            email: 'ana@clinica.com',
            role: 'atendente',
            roleLabel: 'Atendente',
            professionalId: null,
            avatarUrl: '/api/account/avatar/1?v=a',
          },
        },
      });

      const { container } = render(<SidebarIdentity />);

      await screen.findByAltText('Clínica Alfa');
      expect(container.querySelectorAll('img')).toHaveLength(2);
    });

    it('Dada identidade sem imagens, Quando renderizar o menu, Então mostra as iniciais da clínica e da pessoa', async () => {
      respond({
        '/api/auth/identity': {
          clinicLabel: 'Clínica Alfa',
          account: {
            email: 'ana@clinica.com',
            role: 'atendente',
            roleLabel: 'Atendente',
            professionalId: null,
          },
        },
      });

      const { container } = render(<SidebarIdentity />);

      await screen.findByRole('img', { name: 'Clínica Alfa' });
      expect(container.querySelectorAll('img')).toHaveLength(0);
      expect(container.textContent).toContain('ana@clinica.com');
    });
  });
});
