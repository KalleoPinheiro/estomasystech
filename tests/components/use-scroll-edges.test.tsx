// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { scrollFadeMask, useScrollEdges } from '@/components/use-scroll-edges';

afterEach(cleanup);

function Probe() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const edges = useScrollEdges(element);
  return (
    <div ref={setElement} data-testid="faixa">
      {edges.start ? 'esconde-esquerda ' : ''}
      {edges.end ? 'esconde-direita' : ''}
    </div>
  );
}

function medidas(
  el: HTMLElement,
  m: { left: number; client: number; scroll: number },
) {
  Object.defineProperty(el, 'scrollLeft', {
    value: m.left,
    configurable: true,
  });
  Object.defineProperty(el, 'clientWidth', {
    value: m.client,
    configurable: true,
  });
  Object.defineProperty(el, 'scrollWidth', {
    value: m.scroll,
    configurable: true,
  });
}

describe('Feature: Indício de rolagem horizontal (#525)', () => {
  it('Dado conteúdo mais largo que a faixa no início, Quando renderizar, Então só a direita esconde conteúdo', () => {
    render(<Probe />);
    const faixa = screen.getByTestId('faixa');

    act(() => {
      medidas(faixa, { left: 0, client: 300, scroll: 600 });
      faixa.dispatchEvent(new Event('scroll'));
    });

    expect(faixa).toHaveTextContent('esconde-direita');
    expect(faixa).not.toHaveTextContent('esconde-esquerda');
  });

  it('Dado a rolagem no meio, Quando rolar, Então os dois lados escondem conteúdo', () => {
    render(<Probe />);
    const faixa = screen.getByTestId('faixa');

    act(() => {
      medidas(faixa, { left: 100, client: 300, scroll: 600 });
      faixa.dispatchEvent(new Event('scroll'));
    });

    expect(faixa).toHaveTextContent('esconde-esquerda');
    expect(faixa).toHaveTextContent('esconde-direita');
  });

  it('Dado a rolagem no fim, Quando a tela é redimensionada, Então só a esquerda esconde conteúdo', () => {
    render(<Probe />);
    const faixa = screen.getByTestId('faixa');

    act(() => {
      medidas(faixa, { left: 300, client: 300, scroll: 600 });
      window.dispatchEvent(new Event('resize'));
    });

    expect(faixa).toHaveTextContent('esconde-esquerda');
    expect(faixa).not.toHaveTextContent('esconde-direita');
  });

  it('Dado tudo à vista, Quando avaliar, Então nada esmaece', () => {
    expect(scrollFadeMask({ start: false, end: false })).toBeUndefined();
  });

  it('Dado conteúdo escondido de um lado, Quando montar a máscara, Então esmaece só essa borda', () => {
    expect(scrollFadeMask({ start: false, end: true })).toContain(
      'transparent)',
    );
    expect(scrollFadeMask({ start: false, end: true })).not.toMatch(
      /^linear-gradient\(to right, transparent/,
    );
    expect(scrollFadeMask({ start: true, end: false })).toMatch(
      /^linear-gradient\(to right, transparent/,
    );
  });
});
