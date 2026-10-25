// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TriageActions } from '@/app/(staff)/_hoje/triage-actions';
import type { TriagePhotoDto } from '@/lib/dto';
import { renderWithToast } from '../support/render-with-toast';

const mocks = vi.hoisted(() => ({ decideTriage: vi.fn() }));

vi.mock('@/app/(staff)/hoje-actions', () => ({
  decideTriage: mocks.decideTriage,
}));

const photo: TriagePhotoDto = {
  id: 'photo-1',
  conditionTitle: 'Ferida perna E',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  patientNote: null,
  createdAt: '2026-07-18T10:00:00.000Z',
  waitingHours: 2,
  latestScore: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function decide(label: string, confirm = 'Confirmar') {
  renderWithToast(<TriageActions queue={[photo]} />);
  fireEvent.click(screen.getByText(label));
  fireEvent.click(await screen.findByText(confirm));
}

describe('Feature: decisão de triagem pela Server Action (#549)', () => {
  it.each([
    ['Ok, manter plano', 'Confirmar', 'reviewed', 'Foto revisada'],
    [
      'Antecipar retorno',
      'Confirmar antecipação',
      'escalated',
      'Foto escalada',
    ],
  ] as const)(
    'Dada a decisão «%s», Quando a profissional confirma, Então a ação recebe %s e avisa «%s»',
    async (label, confirm, decision, message) => {
      mocks.decideTriage.mockResolvedValue({
        success: true,
        data: null,
        error: null,
      });

      await decide(label, confirm);

      await waitFor(() =>
        expect(mocks.decideTriage).toHaveBeenCalledWith({
          id: 'photo-1',
          decision,
        }),
      );
      expect(await screen.findByText(message)).toBeInTheDocument();
    },
  );

  it('Dado que a ação recusa, Quando a profissional decide, Então mostra o motivo e libera o botão', async () => {
    mocks.decideTriage.mockResolvedValue({
      success: false,
      data: null,
      error: 'Foto já triada',
    });

    await decide('Ok, manter plano');

    expect(await screen.findByText('Foto já triada')).toBeInTheDocument();
    expect(screen.getByText('Ok, manter plano')).not.toBeDisabled();
  });

  it('Dado que a ação lança um Error, Quando a profissional decide, Então mostra a mensagem do erro', async () => {
    mocks.decideTriage.mockRejectedValue(new Error('Sem conexão'));

    await decide('Ok, manter plano');

    expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
  });

  it('Dado que a ação lança algo que não é Error, Quando a profissional decide, Então mostra a mensagem padrão e libera o botão', async () => {
    mocks.decideTriage.mockRejectedValue('falha sem Error');

    await decide('Ok, manter plano');

    expect(await screen.findByText('Erro na triagem')).toBeInTheDocument();
    expect(screen.getByText('Ok, manter plano')).not.toBeDisabled();
  });
});
