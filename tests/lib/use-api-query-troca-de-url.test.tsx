// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useApiQuery } from '@/lib/use-api-query';

const okResponse = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});
const failResponse = (error: string) => ({
  ok: false,
  status: 429,
  json: async () => ({ success: false, data: null, error }),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Feature: useApiQuery nunca devolve dado de outra URL (#578)', () => {
  it('Dado dado da URL A, Quando a URL muda para B e a busca falha, Então data some e o erro aparece', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/a' ? okResponse(['a']) : failResponse('Limite excedido'),
      ),
    );
    const { result, rerender } = renderHook(
      ({ url }) => useApiQuery<string[]>(url),
      { initialProps: { url: '/api/a' } },
    );
    await waitFor(() => expect(result.current.data).toEqual(['a']));

    rerender({ url: '/api/b' });

    await waitFor(() => expect(result.current.error).toBe('Limite excedido'));
    expect(result.current.data).toBeNull();
    expect(result.current.errorStatus).toBe(429);
  });

  it('Dado dado da URL A, Quando a URL muda e B ainda carrega, Então data de A não é devolvido', async () => {
    let resolveB!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/a'
          ? Promise.resolve(okResponse(['a']))
          : new Promise((resolve) => {
              resolveB = resolve;
            }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ url }) => useApiQuery<string[]>(url),
      { initialProps: { url: '/api/a' } },
    );
    await waitFor(() => expect(result.current.data).toEqual(['a']));

    rerender({ url: '/api/b' });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);
    act(() => resolveB(okResponse(['b'])));
    await waitFor(() => expect(result.current.data).toEqual(['b']));
  });

  it('Dado erro na URL B, Quando refresh() dá certo, Então o erro some e data volta', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fail ? failResponse('Limite excedido') : okResponse(['b']),
      ),
    );
    const { result } = renderHook(() => useApiQuery<string[]>('/api/b'));
    await waitFor(() => expect(result.current.error).toBe('Limite excedido'));

    fail = false;
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.data).toEqual(['b']));
    expect(result.current.error).toBeNull();
  });

  it('Dado dado da URL A, Quando refresh() da mesma URL falha, Então o erro aparece e o último dado de A é mantido', async () => {
    let fail = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fail ? failResponse('Limite excedido') : okResponse(['a']),
      ),
    );
    const { result } = renderHook(() => useApiQuery<string[]>('/api/a'));
    await waitFor(() => expect(result.current.data).toEqual(['a']));

    fail = true;
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBe('Limite excedido'));
    expect(result.current.data).toEqual(['a']);
  });
});
