// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@/lib/action-result';
import { useAction } from '@/lib/use-action';

const ok = (data: string): ActionResult<string> => ({
  success: true,
  data,
  error: null,
});

describe('Feature: estado de envio de Server Action (ADR-069 § 2)', () => {
  it('Dada uma ação lenta, Quando a tela a dispara, Então fica pendente até o envelope chegar e guarda o resultado', async () => {
    let finish: (value: ActionResult<string>) => void = () => undefined;
    const action = vi.fn(
      () =>
        new Promise<ActionResult<string>>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useAction(action));
    expect(result.current.isPending).toBe(false);
    expect(result.current.result).toBeNull();

    act(() => result.current.run({ name: 'Ana' }));
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(action).toHaveBeenCalledWith({ name: 'Ana' });

    await act(async () => finish(ok('salvo')));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.result).toEqual(ok('salvo'));
    expect(result.current.error).toBeNull();
  });

  it('Dada uma ação que recusa, Quando o envelope volta com erro, Então a mensagem fica em error para o alerta da tela', async () => {
    const action = vi.fn(async () => ({
      success: false as const,
      data: null,
      error: 'Seu papel não tem acesso a este recurso',
    }));
    const { result } = renderHook(() => useAction(action));

    act(() => result.current.run({}));

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Seu papel não tem acesso a este recurso',
      ),
    );
    expect(result.current.isPending).toBe(false);
  });
});
