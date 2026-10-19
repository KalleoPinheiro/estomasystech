import { describe, expect, it, vi } from 'vitest';
import { startRuntimeGuards } from '@/lib/runtime-guards';

const startMockServer = vi.hoisted(() => vi.fn());
vi.mock('@/infrastructure/mocks/server', () => ({ startMockServer }));

describe('Feature: Guardas de boot (ADR-041)', () => {
  it('Dado a Vercel sem APP_ENV, Então o boot recusa', async () => {
    await expect(startRuntimeGuards({ VERCEL: '1' })).rejects.toThrow(
      'APP_ENV obrigatório na Vercel',
    );
  });

  it('Dado MOCK_INTEGRATIONS=true em preview, Então liga o MSW', async () => {
    await startRuntimeGuards({ APP_ENV: 'preview', MOCK_INTEGRATIONS: 'true' });
    expect(startMockServer).toHaveBeenCalledTimes(1);
  });

  it('Dado sem MOCK_INTEGRATIONS, Então não liga o MSW', async () => {
    startMockServer.mockClear();
    await startRuntimeGuards({ APP_ENV: 'staging' });
    expect(startMockServer).not.toHaveBeenCalled();
  });
});
