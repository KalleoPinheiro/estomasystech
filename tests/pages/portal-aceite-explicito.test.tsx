// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { ConsentCard } from '@/app/portal/consent-card';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: aceite do termo com confirmação explícita (#481)', () => {
  it.each([
    [
      'treatment',
      'Li e aceito o termo de tratamento',
      'Li e concordo com o termo de tratamento',
    ],
    [
      'image',
      'Li e aceito o termo de imagem',
      'Li e concordo com o termo de imagem',
    ],
  ] as const)(
    'Dado o termo de %s pendente, Quando ainda não marcou «Li e concordo», Então o botão fica desabilitado e nada é enviado',
    async (purpose, botao, caixa) => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true, data: {}, error: null }),
      }));
      vi.stubGlobal('fetch', fetchMock);
      const onAccepted = vi.fn();
      renderWithToast(
        <ConsentCard
          purpose={purpose}
          status={{ consentText: 'Texto', accepted: false, acceptedAt: null }}
          onAccepted={onAccepted}
        />,
      );

      const button = screen.getByRole('button', { name: botao });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(fetchMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByLabelText(caixa));
      expect(button).toBeEnabled();
      fireEvent.click(button);
      await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('Dado a caixa marcada, Quando desmarcar, Então o botão volta a ficar desabilitado', () => {
    renderWithToast(
      <ConsentCard
        status={{ consentText: 'Texto', accepted: false, acceptedAt: null }}
        onAccepted={vi.fn()}
      />,
    );
    const caixa = screen.getByLabelText(
      'Li e concordo com o termo de tratamento',
    );
    fireEvent.click(caixa);
    fireEvent.click(caixa);
    expect(
      screen.getByRole('button', { name: 'Li e aceito o termo de tratamento' }),
    ).toBeDisabled();
  });
});
