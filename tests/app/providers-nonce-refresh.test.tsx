// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const nonceStore = vi.hoisted(() => ({
  current: undefined as string | undefined,
}));
vi.mock('get-nonce', () => ({
  setNonce: vi.fn((value: string) => {
    nonceStore.current = value;
  }),
  getNonce: () => nonceStore.current,
}));

afterEach(cleanup);

describe('Feature: Nonce do documento sobrevive ao router.refresh() do login (#562)', () => {
  it('Dado o nonce do HTML carregado, Quando o refresh trouxer outro nonce, Então o get-nonce segue com o primeiro (o único que a CSP vigente reconhece)', async () => {
    const { Providers } = await import('@/app/providers');
    const { rerender } = render(
      <Providers nonce="nonce-do-html">filho</Providers>,
    );
    rerender(<Providers nonce="nonce-do-refresh">filho</Providers>);
    expect(nonceStore.current).toBe('nonce-do-html');
  });
});
