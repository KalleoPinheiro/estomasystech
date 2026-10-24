// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LegacyAnchorRedirect } from '@/app/(staff)/configuracoes/legacy-anchor-redirect';
import { SETTINGS_SECTIONS } from '@/app/(staff)/configuracoes/sections';

const replace = vi.fn();

function openAt(path: string) {
  window.history.replaceState(null, '', path);
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    hash: new URL(path, 'http://localhost').hash,
    search: new URL(path, 'http://localhost').search,
    replace,
  } as Location);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  replace.mockReset();
});

describe('Feature: links antigos de Configurações com âncora (#522)', () => {
  it.each(SETTINGS_SECTIONS.map((section) => section.slug))(
    'Dado /configuracoes#%s, Quando abrir, Então vai para a sub-rota da seção',
    (slug) => {
      openAt(`/configuracoes#${slug}`);
      render(<LegacyAnchorRedirect />);
      expect(replace).toHaveBeenCalledWith(`/configuracoes/${slug}`);
    },
  );

  it('Dado o retorno do OAuth do Google, Quando abrir /configuracoes?calendar=conectado, Então vai para Google Agenda com os mesmos parâmetros', () => {
    openAt('/configuracoes?calendar=erro&reason=acesso_negado');
    render(<LegacyAnchorRedirect />);
    expect(replace).toHaveBeenCalledWith(
      '/configuracoes/google-agenda?calendar=erro&reason=acesso_negado',
    );
  });

  it.each(['/configuracoes', '/configuracoes#nao-existe'])(
    'Dado %s, Quando abrir, Então fica no índice',
    (path) => {
      openAt(path);
      render(<LegacyAnchorRedirect />);
      expect(replace).not.toHaveBeenCalled();
    },
  );
});
