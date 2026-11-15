// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrefetchedQueries } from '@/lib/prefetched-queries';
import { useApiQuery } from '@/lib/use-api-query';

const okResponse = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

const withEntries =
  (entries: Record<string, unknown>) =>
  ({ children }: { children: ReactNode }) => (
    <PrefetchedQueries entries={entries}>{children}</PrefetchedQueries>
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Feature: useApiQuery usa a resposta que o servidor já leu (#557)', () => {
  it('Dado a URL pré-lida, Quando monta, Então devolve o dado na hora e não chama a rede', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiQuery<string[]>('/api/a'), {
      wrapper: withEntries({ '/api/a': ['servidor'] }),
    });

    expect(result.current.data).toEqual(['servidor']);
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dado a URL pré-lida, Quando atualiza, Então busca de novo na rede', async () => {
    const fetchMock = vi.fn(async () => okResponse(['rede']));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useApiQuery<string[]>('/api/a'), {
      wrapper: withEntries({ '/api/a': ['servidor'] }),
    });

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.data).toEqual(['rede']));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Dado outra URL fora do pré-lido, Quando monta, Então busca na rede', async () => {
    const fetchMock = vi.fn(async () => okResponse(['rede']));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiQuery<string[]>('/api/b'), {
      wrapper: withEntries({ '/api/a': ['servidor'] }),
    });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(['rede']));
  });

  it('Dado a URL pré-lida, Quando a URL muda e volta, Então a volta busca na rede', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      okResponse(url === '/api/b' ? ['b'] : ['a-rede']),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(
      ({ url }) => useApiQuery<string[]>(url),
      {
        initialProps: { url: '/api/a' },
        wrapper: withEntries({ '/api/a': ['servidor'] }),
      },
    );

    rerender({ url: '/api/b' });
    await waitFor(() => expect(result.current.data).toEqual(['b']));
    rerender({ url: '/api/a' });

    await waitFor(() => expect(result.current.data).toEqual(['a-rede']));
  });

  it('Dado URL nula, Quando monta, Então não há dado nem busca', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiQuery<string[]>(null), {
      wrapper: withEntries({ '/api/a': ['servidor'] }),
    });

    expect(result.current.data).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
