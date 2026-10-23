// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScrollFade } from '../../src/app/(staff)/scroll-fade';

afterEach(cleanup);

function measure(
  element: HTMLElement,
  sizes: { scrollHeight: number; clientHeight: number },
) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: sizes.scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: sizes.clientHeight,
  });
}

describe('Feature: lista rolável avisa onde há itens escondidos (#524)', () => {
  it('Dado conteúdo maior que a área, Quando rolar até o fim, Então esmaece o fim e depois o começo', () => {
    render(<ScrollFade>menu</ScrollFade>);
    const area = screen.getByText('menu');
    measure(area, { scrollHeight: 456, clientHeight: 360 });

    fireEvent.scroll(area);
    expect(area.style.getPropertyValue('--fade-top')).toBe('0px');
    expect(area.style.getPropertyValue('--fade-bottom')).toBe('1.5rem');

    area.scrollTop = 96;
    fireEvent.scroll(area);
    expect(area.style.getPropertyValue('--fade-top')).toBe('1.5rem');
    expect(area.style.getPropertyValue('--fade-bottom')).toBe('0px');
  });

  it('Dado conteúdo que cabe, Quando montar, Então não esmaece nada', () => {
    render(<ScrollFade>menu</ScrollFade>);
    const area = screen.getByText('menu');
    measure(area, { scrollHeight: 300, clientHeight: 300 });

    fireEvent.scroll(area);
    expect(area.style.getPropertyValue('--fade-bottom')).toBe('0px');
    expect(area.style.getPropertyValue('--fade-top')).toBe('0px');
  });

  it('Dado navegador sem ResizeObserver, Quando montar, Então não quebra', () => {
    const original = globalThis.ResizeObserver;
    // @ts-expect-error simula navegador antigo
    globalThis.ResizeObserver = undefined;
    expect(() => render(<ScrollFade>menu</ScrollFade>)).not.toThrow();
    globalThis.ResizeObserver = original;
  });
});
