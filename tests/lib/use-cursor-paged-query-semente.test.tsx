// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCursorPagedQuery } from '@/lib/use-cursor-paged-query';

interface Row {
  id: string;
}

const page = (rows: Row[], nextCursor: string | null = null) => ({
  ok: true,
  status: 200,
  json: async () => ({
    success: true,
    data: rows,
    error: null,
    meta: { nextCursor },
  }),
});

const SEED = {
  baseUrl: '/api/x',
  items: [{ id: 'semente' }],
  nextCursor: 'c1',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Feature: lista paginada com a 1ª página lida no servidor (#549)', () => {
  it('Dado a 1ª página no HTML, Quando monta, Então mostra a semente sem chamar a API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useCursorPagedQuery<Row>('/api/x', 10, SEED),
    );

    expect(result.current.items).toEqual([{ id: 'semente' }]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isLoading).toBe(false);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dado a semente e «carregar mais», Quando pede a próxima página, Então anexa pelo cursor da semente', async () => {
    const fetchMock = vi.fn(async () => page([{ id: 'p2' }]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useCursorPagedQuery<Row>('/api/x', 10, SEED),
    );

    act(() => result.current.loadMore());

    await waitFor(() =>
      expect(result.current.items).toEqual([{ id: 'semente' }, { id: 'p2' }]),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x?limit=10&cursor=c1',
      expect.anything(),
    );
    expect(result.current.hasMore).toBe(false);
  });

  it('Dado a semente, Quando a URL base muda (busca), Então busca a 1ª página da nova URL', async () => {
    const fetchMock = vi.fn(async () => page([{ id: 'achado' }]));
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ url }) => useCursorPagedQuery<Row>(url, 10, SEED),
      { initialProps: { url: '/api/x' } },
    );

    rerender({ url: '/api/x?search=Ana' });

    await waitFor(() =>
      expect(result.current.items).toEqual([{ id: 'achado' }]),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x?search=Ana&limit=10',
      expect.anything(),
    );
  });

  it('Dado a semente, Quando faz refresh, Então busca a 1ª página de novo', async () => {
    const fetchMock = vi.fn(async () => page([{ id: 'novo' }]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useCursorPagedQuery<Row>('/api/x', 10, SEED),
    );

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.items).toEqual([{ id: 'novo' }]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Dado a busca em voo, Quando a pessoa volta à URL da semente, Então a resposta atrasada não troca a lista', async () => {
    let release!: (value: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ url }) => useCursorPagedQuery<Row>(url, 10, SEED),
      { initialProps: { url: '/api/x' } },
    );

    rerender({ url: '/api/x?search=Ana' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ url: '/api/x' });
    await act(async () => {
      release(page([{ id: 'atrasada' }]));
    });

    expect(result.current.items).toEqual([{ id: 'semente' }]);
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
