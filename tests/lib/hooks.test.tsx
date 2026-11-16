// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useApiQuery } from '@/lib/use-api-query';
import { useCursorPagedQuery } from '@/lib/use-cursor-paged-query';

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: async () => ({ success: ok, data, error: ok ? null : 'Erro simulado' }),
});

const jsonPageResponse = (
  data: unknown,
  nextCursor: string | null,
  ok = true,
) => ({
  ok,
  json: async () => ({
    success: ok,
    data,
    error: ok ? null : 'Erro simulado',
    meta: { nextCursor },
  }),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Feature: useApiQuery', () => {
  it('Dado fetch bem-sucedido, Quando monta, Então preenche data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: '1' })),
    );

    const { result } = renderHook(() => useApiQuery<{ id: string }>('/api/x'));

    await waitFor(() => expect(result.current.data).toEqual({ id: '1' }));
    expect(result.current.error).toBeNull();
  });

  it('Dado fetch com erro, Quando monta, Então preenche error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(null, false)),
    );

    const { result } = renderHook(() => useApiQuery<unknown>('/api/x'));

    await waitFor(() => expect(result.current.error).toBe('Erro simulado'));
    expect(result.current.data).toBeNull();
  });

  it('Dado refresh(), Quando chamado, Então refaz o fetch', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: '1' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiQuery<{ id: string }>('/api/x'));
    await waitFor(() => expect(result.current.data).toEqual({ id: '1' }));

    act(() => result.current.refresh());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('Dado troca de url, Quando muda, Então refaz o fetch para a nova url', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: '1' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ url }) => useApiQuery<{ id: string }>(url),
      {
        initialProps: { url: '/api/x' },
      },
    );
    await waitFor(() => expect(result.current.data).toEqual({ id: '1' }));

    rerender({ url: '/api/y' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/y', expect.anything());
  });

  it('Dado fetch pendente, Quando monta, Então isLoading é true até resolver', async () => {
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const { result } = renderHook(() => useApiQuery<{ id: string }>('/api/x'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();

    act(() => {
      resolveFetch(jsonResponse({ id: '1' }));
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ id: '1' });
  });

  it('Dado fetch bem-sucedido, Quando resolve, Então isLoading fica false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ id: '1' })),
    );

    const { result } = renderHook(() => useApiQuery<{ id: string }>('/api/x'));

    await waitFor(() => expect(result.current.data).toEqual({ id: '1' }));
    expect(result.current.isLoading).toBe(false);
  });

  it('Dado fetch com erro, Quando resolve, Então isLoading fica false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(null, false)),
    );

    const { result } = renderHook(() => useApiQuery<unknown>('/api/x'));

    await waitFor(() => expect(result.current.error).toBe('Erro simulado'));
    expect(result.current.isLoading).toBe(false);
  });

  it('Dado url null, Quando monta, Então isLoading é false (query condicional)', () => {
    vi.stubGlobal('fetch', vi.fn());

    const { result } = renderHook(() => useApiQuery<unknown>(null));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe('Feature: useCursorPagedQuery (issue #75)', () => {
  it('Dado nextCursor nulo, Quando monta, Então hasMore é false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonPageResponse([{ id: '1' }], null)),
    );

    const { result } = renderHook(() =>
      useCursorPagedQuery<{ id: string }>('/api/x', 10),
    );

    await waitFor(() => expect(result.current.items).toEqual([{ id: '1' }]));
    expect(result.current.hasMore).toBe(false);
  });

  it('Dado nextCursor presente, Quando monta, Então hasMore é true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonPageResponse([{ id: '1' }, { id: '2' }], 'cursor-abc'),
      ),
    );

    const { result } = renderHook(() =>
      useCursorPagedQuery<{ id: string }>('/api/x', 2),
    );

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.hasMore).toBe(true);
  });

  it('Dado loadMore(), Quando chamado, Então anexa a página seguinte usando o cursor recebido', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.includes('cursor='))
        return jsonPageResponse([{ id: '1' }, { id: '2' }], 'cursor-abc');
      return jsonPageResponse([{ id: '3' }], null);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useCursorPagedQuery<{ id: string }>('/api/x', 2),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.items).toHaveLength(3));
    expect(result.current.hasMore).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('cursor=cursor-abc'),
      expect.anything(),
    );
  });

  it('Dado loadMore() sem nextCursor, Quando chamado, Então não busca de novo', async () => {
    const fetchMock = vi.fn(async () => jsonPageResponse([{ id: '1' }], null));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useCursorPagedQuery<{ id: string }>('/api/x', 10),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.loadMore());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Dado erro no loadMore(), Quando chamado, Então preenche error mantendo itens atuais', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (!url.includes('cursor='))
        return jsonPageResponse([{ id: '1' }], 'cursor-abc');
      return jsonResponse(null, false);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useCursorPagedQuery<{ id: string }>('/api/x', 1),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.error).toBe('Erro simulado'));
    expect(result.current.items).toHaveLength(1);
  });

  it('Dado erro na primeira página, Quando monta, Então preenche error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(null, false)),
    );

    const { result } = renderHook(() =>
      useCursorPagedQuery<unknown>('/api/x', 10),
    );

    await waitFor(() => expect(result.current.error).toBe('Erro simulado'));
  });

  it('Dado refresh(), Quando chamado, Então refaz a busca da primeira página', async () => {
    const fetchMock = vi.fn(async () => jsonPageResponse([{ id: '1' }], null));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useCursorPagedQuery<{ id: string }>('/api/x', 10),
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.refresh());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
