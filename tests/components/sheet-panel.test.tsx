// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SheetPanel } from '@/components/sheet-panel';

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

describe('Feature: Ficha ao lado da lista no computador e folha de baixo no celular', () => {
  describe('Scenario: tela larga', () => {
    it('Dado o computador, Quando a ficha abre, Então aparece ao lado da lista, sem janela por cima', () => {
      stubViewport(false);
      render(
        <SheetPanel title="Editar item" onClose={() => undefined}>
          <p>Conteúdo da ficha</p>
        </SheetPanel>,
      );

      expect(screen.getByText('Conteúdo da ficha')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('Dado a ficha ao lado, Quando clicar em Fechar ficha, Então avisa o fechamento', () => {
      stubViewport(false);
      const onClose = vi.fn();
      render(
        <SheetPanel title="Editar item" onClose={onClose}>
          <p>Conteúdo da ficha</p>
        </SheetPanel>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Fechar ficha' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scenario: celular', () => {
    it('Dado o celular, Quando a ficha abre, Então sobe como folha de baixo com o título e o conteúdo', () => {
      stubViewport(true);
      render(
        <SheetPanel title="Editar item" onClose={() => undefined}>
          <p>Conteúdo da ficha</p>
        </SheetPanel>,
      );

      const folha = screen.getByRole('dialog');
      expect(folha).toHaveTextContent('Editar item');
      expect(folha).toHaveTextContent('Conteúdo da ficha');
    });

    it('Dado a folha aberta, Quando tocar em Cancelar, Então avisa o fechamento', () => {
      stubViewport(true);
      const onClose = vi.fn();
      render(
        <SheetPanel title="Editar item" onClose={onClose}>
          <p>Conteúdo da ficha</p>
        </SheetPanel>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
