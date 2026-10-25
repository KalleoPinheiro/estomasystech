// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TriagePhotoDto } from '@/lib/dto';
import { useTriageQueue } from '@/lib/use-triage-queue';

const apiFetch = vi.fn();

vi.mock('@/lib/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock('@/lib/use-api-query', () => ({
  useApiQuery: () => ({
    data: [],
    error: null,
    isLoading: false,
    refresh: vi.fn(),
  }),
}));
vi.mock('@still-void/ui/react/client', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const photo = { id: 'photo-1' } as TriagePhotoDto;

describe('Feature: erro da decisão de triagem na página dedicada', () => {
  it('Dado que a decisão falha com uma exceção que não é Error, Quando a profissional decide, Então mostra a mensagem padrão e libera o botão', async () => {
    apiFetch.mockRejectedValueOnce('falha sem Error');
    const { result } = renderHook(() => useTriageQueue());

    await act(async () => {
      await result.current.triage(photo, 'reviewed');
    });

    expect(result.current.actionError).toBe('Erro na triagem');
    expect(result.current.submittingId).toBeNull();
  });
});
