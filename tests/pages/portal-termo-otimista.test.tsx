// @vitest-environment jsdom

import { ToastProvider } from '@still-void/ui/react/client';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { ConsentCard } from '@/app/portal/consent-card';
import type { ActionResult } from '@/lib/action-result';

const actions = vi.hoisted(() => ({
  acceptConsent: vi.fn(),
  revokeConsent: vi.fn(),
}));
vi.mock('@/app/portal/actions', () => actions);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pending = {
  consentText: 'Texto do termo',
  accepted: false,
  acceptedAt: null,
};
const accepted = {
  consentText: 'Texto do termo',
  accepted: true,
  acceptedAt: '2026-10-31T15:00:00.000Z',
};
const ok: ActionResult<unknown> = { success: true, data: {}, error: null };
const REVOKE_BUTTON = 'Revogar consentimento do tratamento';

function acceptNow() {
  fireEvent.click(
    screen.getByLabelText('Li e concordo com o termo de tratamento'),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Li e aceito o termo de tratamento' }),
  );
}

describe('Feature: o cartão do termo troca no toque, sem esperar a rede (#623, CLS)', () => {
  it('Dado o termo pendente, Quando toca em aceitar e o servidor ainda não respondeu, Então o cartão já mostra o termo aceito e o botão de aceitar sai', async () => {
    let finish: (value: ActionResult<unknown>) => void = () => undefined;
    actions.acceptConsent.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    let reloaded: () => void = () => undefined;
    const onAccepted = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          reloaded = resolve;
        }),
    );
    renderWithToast(<ConsentCard status={pending} onAccepted={onAccepted} />);

    acceptNow();

    // Cartão aceito já no toque; o botão de revogar só vale com o servidor.
    const revoke = await screen.findByRole('button', { name: REVOKE_BUTTON });
    expect(revoke).toBeDisabled();
    expect(
      screen.queryByRole('button', {
        name: 'Li e aceito o termo de tratamento',
      }),
    ).toBeNull();
    // O aviso verde só sai depois da confirmação: até lá só o cartão diz «aceito».
    expect(
      screen.getAllByText(/Termo de consentimento do tratamento aceito/),
    ).toHaveLength(1);

    await act(async () => finish(ok));

    await waitFor(() =>
      expect(
        screen.getAllByText(/Termo de consentimento do tratamento aceito/),
      ).toHaveLength(2),
    );
    expect(screen.getByRole('button', { name: REVOKE_BUTTON })).toBeEnabled();
    await act(async () => reloaded());
  });

  it('Dado o aceite recusado pelo servidor, Quando a resposta chega, Então o termo volta a pendente e o erro aparece', async () => {
    actions.acceptConsent.mockResolvedValue({
      success: false,
      data: null,
      error: 'Clínica sem encarregado',
    });
    renderWithToast(<ConsentCard status={pending} onAccepted={vi.fn()} />);

    acceptNow();

    await waitFor(() =>
      expect(
        screen.getAllByText('Clínica sem encarregado').length,
      ).toBeGreaterThan(0),
    );
    expect(
      screen.getByRole('button', { name: 'Li e aceito o termo de tratamento' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: REVOKE_BUTTON })).toBeNull();
    expect(
      screen.queryByText(/Termo de consentimento do tratamento aceito/),
    ).toBeNull();
  });

  it('Dado o aceite em voo, Quando o servidor confirma pela tela, Então vale a data do servidor', async () => {
    let finish: (value: ActionResult<unknown>) => void = () => undefined;
    actions.acceptConsent.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { rerender } = renderWithToast(
      <ConsentCard status={pending} onAccepted={vi.fn()} />,
    );
    acceptNow();
    await screen.findByRole('button', { name: REVOKE_BUTTON });

    rerender(
      <ToastProvider>
        <ConsentCard status={accepted} onAccepted={vi.fn()} />
      </ToastProvider>,
    );

    expect(screen.getByText(/31\/10\/2026/)).toBeTruthy();
    await act(async () => finish(ok));
    expect(screen.getByText(/31\/10\/2026/)).toBeTruthy();
  });

  it('Dado o termo aceito, Quando revoga e confirma, Então o termo pendente aparece no toque; se o servidor recusa, volta ao aceito', async () => {
    let finish: (value: ActionResult<unknown>) => void = () => undefined;
    actions.revokeConsent.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderWithToast(<ConsentCard status={accepted} onAccepted={vi.fn()} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Revogar consentimento do tratamento',
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Revogar' }));

    expect(
      await screen.findByRole('button', {
        name: 'Li e aceito o termo de tratamento',
      }),
    ).toBeTruthy();
    await act(async () =>
      finish({ success: false, data: null, error: 'Sem permissão' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: REVOKE_BUTTON })).toBeTruthy(),
    );
  });
});
