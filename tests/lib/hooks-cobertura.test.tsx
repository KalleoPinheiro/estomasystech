// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetchPage } from '@/lib/client';
import { useApiQuery } from '@/lib/use-api-query';
import { useCursorPagedQuery } from '@/lib/use-cursor-paged-query';
import { useDocumentIssuance } from '@/lib/use-document-issuance';
import { usePagedQuery } from '@/lib/use-paged-query';

interface Deferred {
  promise: Promise<unknown>;
  resolve: (envelope: unknown) => void;
  reject: (reason: unknown) => void;
}

const deferred = (): Deferred => {
  let resolve!: Deferred['resolve'];
  let reject!: Deferred['reject'];
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const ok = (data: unknown, nextCursor: string | null = null) => ({
  ok: true,
  status: 200,
  json: async () => ({
    success: true,
    data,
    error: null,
    meta: { nextCursor },
  }),
});

/** fetch cujas respostas são liberadas pelo teste, na ordem das chamadas. */
function controlledFetch() {
  const pending: Deferred[] = [];
  const fetchMock = vi.fn(() => {
    const d = deferred();
    pending.push(d);
    return d.promise;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { pending, fetchMock };
}

const rejectWith = (reason: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(reason)),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Feature: Emissão de documento persistida (#94, DOC-01)', () => {
  it('Dado falha que não é um Error, Quando emitir, Então mostra a mensagem padrão', async () => {
    rejectWith('queda de rede');

    const { result } = renderHook(() => useDocumentIssuance('atestado', 'p-1'));

    await waitFor(() =>
      expect(result.current.error).toBe('Erro ao emitir documento'),
    );
  });

  it('Dado a tela fechada antes da resposta, Quando a emissão responde ou falha, Então nada é aplicado', async () => {
    const { pending } = controlledFetch();

    const first = renderHook(() => useDocumentIssuance('atestado', 'p-1'));
    const second = renderHook(() =>
      useDocumentIssuance('recibo', 'p-2', 'f-1'),
    );
    first.unmount();
    second.unmount();
    await act(async () => {
      pending[0].resolve(
        ok({ documentNumber: 'DOC-1', issuedAt: '2026-10-20T00:00:00Z' }),
      );
      pending[1].reject(new Error('falha tardia'));
    });

    expect(first.result.current.issuance).toBeNull();
    expect(second.result.current.error).toBeNull();
  });
});

describe('Feature: Emissão de documento com erro do servidor', () => {
  it('Dado erro com mensagem, Quando emitir, Então mostra a mensagem do servidor', async () => {
    rejectWith(new Error('Documento sem CPF do paciente'));

    const { result } = renderHook(() => useDocumentIssuance('recibo', 'p-1'));

    await waitFor(() =>
      expect(result.current.error).toBe('Documento sem CPF do paciente'),
    );
  });
});

describe('Feature: Lista paginada por deslocamento', () => {
  it('Dado a tela fechada antes da 1ª página, Quando responde ou falha, Então o estado não muda', async () => {
    const { pending } = controlledFetch();

    const first = renderHook(() => usePagedQuery<string>('/api/a', 2));
    const second = renderHook(() => usePagedQuery<string>('/api/b', 2));
    first.unmount();
    second.unmount();
    await act(async () => {
      pending[0].resolve(ok(['x']));
      pending[1].reject(new Error('tarde'));
    });

    expect(first.result.current.items).toBeNull();
    expect(second.result.current.error).toBeNull();
  });

  it('Dado falha que não é Error na 1ª página, Quando carregar, Então usa a mensagem padrão', async () => {
    rejectWith('queda');

    const { result } = renderHook(() => usePagedQuery<string>('/api/a', 2));

    await waitFor(() =>
      expect(result.current.error).toBe('Erro ao carregar dados'),
    );
  });

  it('Dado "carregar mais" antes da 1ª página chegar, Quando as respostas chegam, Então a página anexada parte do zero; falha sem Error usa a mensagem padrão', async () => {
    const { pending } = controlledFetch();
    const { result } = renderHook(() => usePagedQuery<string>('/api/a', 2));

    act(() => result.current.loadMore());
    await act(async () => {
      pending[1].resolve(ok(['a', 'b']));
    });
    expect(result.current.items).toEqual(['a', 'b']);

    rejectWith('queda');
    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(result.current.error).toBe('Erro ao carregar dados'),
    );
  });
});

describe('Feature: Lista paginada por cursor (#75)', () => {
  it('Dado atualização enquanto a 1ª página está em voo, Quando a resposta antiga chega ou falha, Então é descartada', async () => {
    const { pending } = controlledFetch();
    const { result } = renderHook(() =>
      useCursorPagedQuery<string>('/api/a', 2),
    );

    act(() => result.current.refresh());
    await act(async () => {
      pending[0].resolve(ok(['antigo']));
    });
    expect(result.current.items).toBeNull();

    act(() => result.current.refresh());
    await act(async () => {
      pending[1].reject(new Error('antigo'));
    });
    expect(result.current.error).toBeNull();

    await act(async () => {
      pending[2].resolve(ok(['novo']));
    });
    expect(result.current.items).toEqual(['novo']);
  });

  it('Dado falha que não é Error na 1ª página, Quando carregar, Então usa a mensagem padrão', async () => {
    rejectWith('queda');

    const { result } = renderHook(() =>
      useCursorPagedQuery<string>('/api/a', 2),
    );

    await waitFor(() =>
      expect(result.current.error).toBe('Erro ao carregar dados'),
    );
  });

  it('Dado "carregar mais" em voo, Quando uma atualização o ultrapassa, Então a resposta antiga ou sua falha são descartadas', async () => {
    const { pending } = controlledFetch();
    const { result } = renderHook(() =>
      useCursorPagedQuery<string>('/api/a', 2),
    );
    await act(async () => {
      pending[0].resolve(ok(['a', 'b'], 'c1'));
    });
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    act(() => result.current.refresh());
    await act(async () => {
      pending[1].resolve(ok(['velho'], null));
    });
    expect(result.current.items).toEqual(['a', 'b']);

    await act(async () => {
      pending[2].resolve(ok(['a', 'b'], 'c1'));
    });
    act(() => result.current.loadMore());
    act(() => result.current.refresh());
    await act(async () => {
      pending[3].reject(new Error('velho'));
    });
    expect(result.current.error).toBeNull();
  });

  it('Dado "carregar mais" que falha sem Error, Quando responder, Então usa a mensagem padrão', async () => {
    const { pending } = controlledFetch();
    const { result } = renderHook(() =>
      useCursorPagedQuery<string>('/api/a', 2),
    );
    await act(async () => {
      pending[0].resolve(ok(['a', 'b'], 'c1'));
    });

    act(() => result.current.loadMore());
    await act(async () => {
      pending[1].reject('queda');
    });

    expect(result.current.error).toBe('Erro ao carregar dados');
  });
});

describe('Feature: Consulta simples e envelope de página', () => {
  it('Dado falha que não é Error, Quando consultar, Então usa a mensagem padrão', async () => {
    rejectWith('queda');

    const { result } = renderHook(() => useApiQuery<unknown>('/api/x'));

    await waitFor(() =>
      expect(result.current.error).toBe('Erro ao carregar dados'),
    );
  });

  it('Dado página sem dados, Quando ler, Então devolve lista vazia e sem próximo cursor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: null, error: null }),
      })),
    );

    expect(await apiFetchPage('/api/x')).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
