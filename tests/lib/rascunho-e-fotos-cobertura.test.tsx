// @vitest-environment jsdom

import { ToastProvider } from '@still-void/ui/react/client';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const identity = vi.hoisted(() => ({
  current: null as { identity: { account: { email: string } } } | null,
}));

vi.mock('@/lib/staff-access', () => ({
  useStaffIdentity: () => identity.current,
}));

import { useConditionPhotos } from '@/lib/use-condition-photos';
import { useSessionDraft } from '@/lib/use-session-draft';

afterEach(() => {
  identity.current = null;
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('Feature: Rascunho que sobrevive ao login (#207)', () => {
  it('Dado identidade ainda não carregada, Quando guardar o rascunho, Então nada é gravado no navegador', () => {
    const { result } = renderHook(() => useSessionDraft('anamnese', vi.fn()));

    act(() => result.current.stash({ texto: 'dor leve' }));

    expect(window.sessionStorage.length).toBe(0);
  });

  it('Dado conta identificada, Quando guardar e remontar o formulário, Então o rascunho da mesma conta é restaurado uma vez', async () => {
    identity.current = { identity: { account: { email: 'ana@clinica.com' } } };
    const first = renderHook(() => useSessionDraft('anamnese', vi.fn()));
    act(() => first.result.current.stash({ texto: 'dor leve' }));
    first.unmount();

    const onRestore = vi.fn();
    const second = renderHook(() => useSessionDraft('anamnese', onRestore));

    await waitFor(() => expect(second.result.current.recovered).toBe(true));
    expect(onRestore).toHaveBeenCalledWith({ texto: 'dor leve' });
    act(() => second.result.current.dismiss());
    expect(second.result.current.recovered).toBe(false);
  });
});

describe('Feature: Fotos de evolução da condição', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
  );

  it('Dado exclusão que falha sem Error, Quando excluir a foto, Então mostra a mensagem padrão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        init?.method === 'DELETE'
          ? Promise.reject('queda')
          : Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ success: true, data: [], error: null }),
            }),
      ),
    );
    const { result } = renderHook(() => useConditionPhotos('cond-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.photos).toEqual([]));

    await act(async () => {
      await result.current.remove({ id: 'foto-1' } as never);
    });

    expect(result.current.actionError).toBe('Erro ao excluir foto');
  });

  it('Dado exclusão recusada pelo servidor, Quando excluir a foto, Então mostra a mensagem do servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        init?.method === 'DELETE'
          ? Promise.reject(new Error('Foto não encontrada'))
          : Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ success: true, data: [], error: null }),
            }),
      ),
    );
    const { result } = renderHook(() => useConditionPhotos('cond-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.photos).toEqual([]));

    await act(async () => {
      await result.current.remove({ id: 'foto-1' } as never);
    });

    expect(result.current.actionError).toBe('Foto não encontrada');
  });
});
