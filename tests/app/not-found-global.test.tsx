// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NotFound from '@/app/not-found';

afterEach(cleanup);

describe('Feature: 404 global acolhedora (#656)', () => {
  it('Dado um endereço inexistente, Quando a 404 global renderiza, Então mostra o título em pt-BR e um único h1', () => {
    render(<NotFound />);
    expect(
      screen.getAllByRole('heading', {
        level: 1,
        name: 'Página não encontrada',
      }),
    ).toHaveLength(1);
  });

  it('Dado a 404 global, Quando a pessoa quer sair dela, Então há um link para voltar ao início', () => {
    render(<NotFound />);
    expect(
      screen.getByRole('link', { name: 'Voltar ao início' }),
    ).toHaveAttribute('href', '/');
  });

  it('Dado a 404 global, Quando renderiza, Então não usa <style> nem style inline (a CSP só aceita nonce)', () => {
    const { container } = render(<NotFound />);
    expect(container.querySelector('style')).toBeNull();
    expect(container.querySelector('[style]')).toBeNull();
  });
});
