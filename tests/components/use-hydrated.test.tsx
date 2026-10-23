// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { useHydrated } from '@/components/app-shell/use-hydrated';

function Probe() {
  return (
    <button type="button" disabled={!useHydrated()}>
      Agir
    </button>
  );
}

afterEach(cleanup);

describe('useHydrated (#484)', () => {
  it('dado o HTML do servidor, o botão chega desabilitado', () => {
    expect(renderToString(<Probe />)).toContain('disabled');
  });

  it('dado o cliente já montado, o botão responde ao clique', () => {
    render(<Probe />);
    expect(screen.getByRole('button', { name: 'Agir' })).toBeEnabled();
  });
});
