// @vitest-environment jsdom

import { ToastProvider, TooltipProvider } from '@still-void/ui/react/client';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import {
  restoreFocusAfterDecision,
  TriagePhotoList,
} from '@/components/triage-photo-list';
import type { TriagePhotoDto } from '@/lib/dto';

afterEach(() => cleanup());

const photo = (id: string, name: string): TriagePhotoDto => ({
  id,
  conditionTitle: 'Ferida perna E',
  patientId: `pat-${id}`,
  patientName: name,
  patientNote: null,
  createdAt: '2026-07-18T10:00:00.000Z',
  waitingHours: 2,
  latestScore: null,
});

function Page({ queue }: { queue: TriagePhotoDto[] }) {
  return (
    <main id="conteudo-principal" tabIndex={-1}>
      <TriagePhotoList
        queue={queue}
        actionError={null}
        submittingId={null}
        onTriage={vi.fn()}
      />
    </main>
  );
}

const withProviders = (ui: ReactElement) => (
  <ToastProvider>
    <TooltipProvider delayDuration={300}>{ui}</TooltipProvider>
  </ToastProvider>
);

async function decideFirst() {
  fireEvent.click(
    screen.getAllByRole('button', {
      name: 'Ok, manter plano',
    })[0] as HTMLElement,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
}

describe('Feature: foco depois da decisão de triagem (#559)', () => {
  it('Dada a decisão sobre a primeira foto, Quando a fila perde a linha, Então o foco vai para a próxima foto e não para o body', async () => {
    const { rerender } = renderWithToast(
      <Page queue={[photo('a', 'Ana'), photo('b', 'Beto')]} />,
    );
    await decideFirst();

    rerender(withProviders(<Page queue={[photo('b', 'Beto')]} />));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Ampliar foto de Beto' }),
      ).toHaveFocus(),
    );
  });

  it('Dada a decisão sobre a última foto, Quando a fila esvazia e a lista sai, Então o foco vai ao conteúdo principal', async () => {
    const { rerender } = renderWithToast(<Page queue={[photo('a', 'Ana')]} />);
    await decideFirst();

    rerender(
      withProviders(
        <main id="conteudo-principal" tabIndex={-1}>
          <p>Nenhuma foto aguardando triagem.</p>
        </main>,
      ),
    );

    await waitFor(() =>
      expect(document.getElementById('conteudo-principal')).toHaveFocus(),
    );
  });

  it('Dada a fila atualizada sem decisão do usuário, Quando o foco está em outro lugar, Então o foco não é movido', () => {
    const { rerender } = renderWithToast(
      <Page queue={[photo('a', 'Ana'), photo('b', 'Beto')]} />,
    );
    const first = screen.getByRole('button', { name: 'Ampliar foto de Ana' });
    first.focus();

    rerender(withProviders(<Page queue={[photo('a', 'Ana')]} />));

    expect(first).toHaveFocus();
  });
});

describe('restoreFocusAfterDecision', () => {
  it('Dado o foco já em um elemento da página, Quando restaura, Então não o rouba', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const other = document.createElement('button');
    document.body.append(other);

    restoreFocusAfterDecision(null);

    expect(input).toHaveFocus();
    input.remove();
    other.remove();
  });

  it('Dado o foco no body e nenhum destino, Quando restaura, Então não lança', () => {
    document.body.focus();
    expect(() => restoreFocusAfterDecision(null)).not.toThrow();
  });
});
