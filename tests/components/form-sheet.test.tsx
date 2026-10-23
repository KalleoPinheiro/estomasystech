// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormSheet } from '@/components/form-sheet';

function stubViewport(mobile: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: mobile,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSheet(props: { dirty: boolean; onClose?: () => void }) {
  const onClose = props.onClose ?? vi.fn();
  render(
    <FormSheet
      title="Avaliação — Ferida"
      onClose={onClose}
      dirty={props.dirty}
      discardTitle="Descartar avaliação?"
    >
      <button type="button">Registrar avaliação</button>
    </FormSheet>,
  );
  return onClose;
}

describe('Feature: Formulário longo em janela no computador e folha de tela cheia no celular', () => {
  describe('Cenário: computador', () => {
    it('Dado o computador, Quando a janela abre, Então é o diálogo de sempre e fechar não pede confirmação', () => {
      stubViewport(false);
      const onClose = renderSheet({ dirty: true });

      expect(screen.getByRole('dialog')).toHaveTextContent(
        'Avaliação — Ferida',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByText('Descartar avaliação?'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Cenário: celular', () => {
    it('Dado o celular, Quando a folha abre, Então mostra título e o formulário com a ação principal', () => {
      stubViewport(true);
      renderSheet({ dirty: false });

      const folha = screen.getByRole('dialog');
      expect(folha).toHaveTextContent('Avaliação — Ferida');
      expect(
        screen.getByRole('button', { name: 'Registrar avaliação' }),
      ).toBeInTheDocument();
    });

    it('Dado nada preenchido, Quando tocar em Cancelar, Então fecha direto', () => {
      stubViewport(true);
      const onClose = renderSheet({ dirty: false });

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Dado dados preenchidos, Quando tocar em Cancelar, Então pergunta antes de descartar e não fecha', () => {
      stubViewport(true);
      const onClose = renderSheet({ dirty: true });

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.getByText('Descartar avaliação?')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('Dado a pergunta de descarte, Quando escolher Continuar editando, Então a folha segue aberta', () => {
      stubViewport(true);
      const onClose = renderSheet({ dirty: true });
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      fireEvent.click(
        screen.getByRole('button', { name: 'Continuar editando' }),
      );

      expect(onClose).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Registrar avaliação' }),
      ).toBeInTheDocument();
    });

    it('Dado a pergunta de descarte, Quando escolher Descartar, Então fecha a folha', () => {
      stubViewport(true);
      const onClose = renderSheet({ dirty: true });
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
