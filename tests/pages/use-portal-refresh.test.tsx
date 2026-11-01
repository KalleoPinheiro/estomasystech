// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePortalRefresh } from '@/app/portal/use-portal-refresh';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Feature: a releitura do portal avisa quando termina (#623, CLS)', () => {
  it('Dado um refresh pedido, Quando a transição termina, Então a promessa se resolve e o roteador foi chamado uma vez', async () => {
    const { result } = renderHook(() => usePortalRefresh());
    let done = false;

    await act(async () => {
      void result.current().then(() => {
        done = true;
      });
    });

    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(done).toBe(true);
  });

  it('Dado uma releitura que não termina, Quando passa o teto de espera, Então a promessa se resolve mesmo assim', async () => {
    vi.useFakeTimers();
    router.refresh.mockImplementation(() => new Promise<void>(() => undefined));
    const { result } = renderHook(() => usePortalRefresh());
    let done = false;

    await act(async () => {
      void result.current().then(() => {
        done = true;
      });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(done).toBe(true);
  });
});
