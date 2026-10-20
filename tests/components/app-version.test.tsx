// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppVersion } from '@/components/app-version';

afterEach(cleanup);

describe('Feature: Nota de versão na tela autenticada', () => {
  it('Dado uma versão, Quando renderiza, Então mostra o texto discreto', () => {
    render(<AppVersion version="v0.2.0" />);

    expect(screen.getByText('v0.2.0')).toBeTruthy();
  });

  it('Dado nenhuma versão, Quando renderiza, Então não renderiza nada', () => {
    const { container } = render(<AppVersion version={null} />);

    expect(container.innerHTML).toBe('');
  });
});
