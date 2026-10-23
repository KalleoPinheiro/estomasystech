// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorAlert } from '@/components/feedback';

afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('Feature: erro de formulário sempre à vista (#478)', () => {
  it('Dado um formulário rolado até o Salvar, Quando o erro aparece ou muda, Então a tela rola até o alerta', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const { rerender } = render(<ErrorAlert message="Telefone inválido" />);
    rerender(<ErrorAlert message="CPF inválido" />);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('Dado um navegador sem scrollIntoView, Quando o erro aparece, Então não quebra', () => {
    expect(() => render(<ErrorAlert message="Falha" />)).not.toThrow();
  });
});
