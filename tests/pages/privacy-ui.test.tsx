// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { PrivacyContactSection } from '@/app/(staff)/configuracoes/privacy-contact-section';
import { ConsentCard } from '@/app/portal/consent-card';
import { PrivacyNoticeCard } from '@/app/portal/privacy-notice-card';
import PrivacyNoticePage from '@/app/privacidade/page';

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Aviso de privacidade público (#216)', () => {
  it('Dada a página sem login, Então mostra o aviso genérico, sem marcadores, com volta ao login', () => {
    render(<PrivacyNoticePage />);

    expect(screen.getByText(/AVISO DE PRIVACIDADE/)).toBeInTheDocument();
    expect(
      screen.getByText(/a clínica onde você se atende/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\{\{/);
    expect(
      screen.getByRole('link', { name: 'Voltar ao login' }),
    ).toHaveAttribute('href', '/login');
  });
});

describe('Feature: Aviso de privacidade da clínica no portal (#216)', () => {
  it('Dado o cartão fechado, Quando abrir, Então busca e mostra o aviso da clínica; fechar oculta', async () => {
    const fetchMock = vi.fn(async () =>
      ok({ version: 'v1', text: 'AVISO da Clínica Aurora' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithToast(<PrivacyNoticeCard />);

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Ler o aviso de privacidade'));

    expect(
      await screen.findByText('AVISO da Clínica Aurora'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/privacy-notice',
      expect.anything(),
    );
    fireEvent.click(screen.getByText('Ocultar o aviso'));
    expect(
      screen.queryByText('AVISO da Clínica Aurora'),
    ).not.toBeInTheDocument();
  });

  it('Dada falha ao buscar, Então mostra o erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ success: false, data: null, error: 'Sem CNPJ' }),
      })),
    );
    renderWithToast(<PrivacyNoticeCard />);

    fireEvent.click(screen.getByText('Ler o aviso de privacidade'));

    expect(await screen.findByText('Sem CNPJ')).toBeInTheDocument();
  });
});

describe('Feature: Cartão do termo de imagem (#216)', () => {
  it('Dado termo de imagem pendente, Quando aceitar, Então chama a finalidade image', async () => {
    const fetchMock = vi.fn(async () => ok({ accepted: true }));
    vi.stubGlobal('fetch', fetchMock);
    const onAccepted = vi.fn();
    renderWithToast(
      <ConsentCard
        purpose="image"
        status={{ consentText: 'TERMO IMG', accepted: false, acceptedAt: null }}
        onAccepted={onAccepted}
      />,
    );

    expect(
      screen.getByText('Termo de autorização de imagem pendente'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('Li e aceito o termo de imagem'));

    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/patient/consent?purpose=image',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Dado termo de imagem aceito, Quando revogar, Então chama a revogação da finalidade image', async () => {
    const fetchMock = vi.fn(async () => ok({ revoked: true }));
    vi.stubGlobal('fetch', fetchMock);
    const onAccepted = vi.fn();
    renderWithToast(
      <ConsentCard
        purpose="image"
        status={{
          consentText: 'TERMO IMG',
          accepted: true,
          acceptedAt: '2026-10-18T10:00:00.000Z',
        }}
        onAccepted={onAccepted}
      />,
    );

    fireEvent.click(screen.getByText('Revogar autorização de imagem'));
    fireEvent.click(await screen.findByRole('button', { name: 'Revogar' }));

    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/patient/consent/revoke?purpose=image',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('Feature: Encarregado pelos dados em Configurações (#216)', () => {
  const info = {
    name: 'Clínica',
    cnpj: null,
    address: null,
    city: null,
    professionalName: null,
    professionalRegistry: null,
    contactPhone: null,
    contactEmail: null,
    dpoName: 'Beatriz Lima',
    dpoContact: 'dpo@clinica.test',
  };

  it('Dado o cadastro, Então mostra o encarregado e o aviso de revisão jurídica pendente', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ info })),
    );
    renderWithToast(<PrivacyContactSection />);

    expect(await screen.findByDisplayValue('Beatriz Lima')).toBeInTheDocument();
    expect(screen.getByDisplayValue('dpo@clinica.test')).toBeInTheDocument();
    expect(
      screen.getByText(/sem revisão de profissional jurídico/),
    ).toBeInTheDocument();
  });

  it('Dada edição, Quando salvar, Então envia PUT só com os campos do encarregado', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      ok({ info }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithToast(<PrivacyContactSection />);

    const name = await screen.findByDisplayValue('Beatriz Lima');
    fireEvent.change(name, { target: { value: 'Carla Dias' } });
    fireEvent.click(screen.getByText('Salvar encarregado'));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
      );
      expect(put).toBeTruthy();
      const init = (put?.[1] ?? {}) as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual({
        dpoName: 'Carla Dias',
        dpoContact: 'dpo@clinica.test',
      });
    });
  });

  it('Dada falha ao carregar, Então mostra o erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ success: false, data: null, error: 'Falhou' }),
      })),
    );
    renderWithToast(<PrivacyContactSection />);

    expect(await screen.findByText('Falhou')).toBeInTheDocument();
  });
});
