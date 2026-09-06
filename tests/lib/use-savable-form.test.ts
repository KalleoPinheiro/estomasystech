// @vitest-environment jsdom

import { ToastProvider } from '@still-void/ui/react/client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSavableForm } from '@/lib/use-savable-form';

const wrapper = ToastProvider;

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: async () => ({ success: ok, data, error: ok ? null : 'Erro simulado' }),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Feature: useSavableForm', () => {
  it('Dado initialValue, Quando monta sem edits, Então draft é initialValue (CFG-SEAM-01)', () => {
    vi.stubGlobal('fetch', vi.fn());

    const { result } = renderHook(
      () =>
        useSavableForm({
          endpoint: '/api/x',
          initialValue: { name: 'a' },
          successMessage: 'ok',
          errorFallback: 'erro',
        }),
      { wrapper },
    );

    expect(result.current.draft).toEqual({ name: 'a' });
    expect(result.current.saveError).toBeNull();
    expect(typeof result.current.save).toBe('function');
  });

  it('Dado save() bem-sucedido, Quando PUT resolve, Então chama onSaved e limpa saveError (CFG-SEAM-02)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ name: 'b' }));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();

    const { result } = renderHook(
      () =>
        useSavableForm({
          endpoint: '/api/x',
          initialValue: { name: 'a' },
          successMessage: 'Salvo com sucesso',
          errorFallback: 'erro',
          onSaved,
        }),
      { wrapper },
    );

    act(() => result.current.setDraft({ name: 'b' }));
    await act(async () => {
      await result.current.save();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/x',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'b' }),
      }),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current.saveError).toBeNull();
  });

  it('Dado save() com PUT rejeitando com Error, Quando falha, Então saveError é a mensagem do erro (CFG-SEAM-03)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(null, false)),
    );

    const { result } = renderHook(
      () =>
        useSavableForm({
          endpoint: '/api/x',
          initialValue: { name: 'a' },
          successMessage: 'ok',
          errorFallback: 'erro padrão',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.save();
    });

    await waitFor(() => expect(result.current.saveError).toBe('Erro simulado'));
  });

  it('Dado validate() retornando mensagem, Quando save() é chamado, Então seta saveError e não chama fetch (CFG-SEAM-04)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ name: 'a' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () =>
        useSavableForm({
          endpoint: '/api/x',
          initialValue: { name: 'a' },
          successMessage: 'ok',
          errorFallback: 'erro',
          validate: () => 'inválido',
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.saveError).toBe('inválido');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
