// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmAction } from '@/components/confirm-action';

afterEach(() => {
  cleanup();
});

describe('Feature: ConfirmAction', () => {
  describe('Cenário: abertura pelo trigger', () => {
    it('Dado clique no trigger, Quando acionado, Então abre o dialog com título e descrição corretos', () => {
      render(
        <ConfirmAction
          trigger={<button type="button">Excluir</button>}
          title="Excluir foto?"
          description="Remove a evidência clínica permanentemente."
          confirmLabel="Excluir"
          onConfirm={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

      expect(
        screen.getByRole('alertdialog', { name: 'Excluir foto?' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Remove a evidência clínica permanentemente.'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: confirmação', () => {
    it('Dado clique em confirmar, Quando acionado, Então dispara onConfirm uma vez e fecha o dialog', async () => {
      const onConfirm = vi.fn();
      render(
        <ConfirmAction
          trigger={<button type="button">Excluir</button>}
          title="Excluir foto?"
          description="Remove a evidência clínica permanentemente."
          confirmLabel="Sim, excluir"
          onConfirm={onConfirm}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sim, excluir' }));

      expect(onConfirm).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Cenário: cancelamento', () => {
    it('Dado clique em cancelar, Quando acionado, Então não dispara onConfirm', () => {
      const onConfirm = vi.fn();
      render(
        <ConfirmAction
          trigger={<button type="button">Excluir</button>}
          title="Excluir foto?"
          description="Remove a evidência clínica permanentemente."
          confirmLabel="Excluir"
          onConfirm={onConfirm}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: fechamento pela tecla Escape', () => {
    it('Dado Escape pressionado, Quando o dialog está aberto, Então fecha sem disparar onConfirm', async () => {
      const onConfirm = vi.fn();
      render(
        <ConfirmAction
          trigger={<button type="button">Excluir</button>}
          title="Excluir foto?"
          description="Remove a evidência clínica permanentemente."
          confirmLabel="Excluir"
          onConfirm={onConfirm}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: variante success', () => {
    it('Dado variant="success", Quando o dialog abre, Então o botão de confirmação usa a cor de sucesso', () => {
      render(
        <ConfirmAction
          trigger={<button type="button">Antecipar retorno</button>}
          title="Antecipar o retorno do paciente?"
          description="O retorno do paciente é antecipado com base nesta foto."
          confirmLabel="Confirmar antecipação"
          variant="success"
          onConfirm={vi.fn()}
        />,
      );

      fireEvent.click(
        screen.getByRole('button', { name: 'Antecipar retorno' }),
      );

      expect(
        screen.getByRole('button', { name: 'Confirmar antecipação' }),
      ).toHaveClass('bg-success');
    });
  });
});
