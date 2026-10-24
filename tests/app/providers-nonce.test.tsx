// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const setNonce = vi.fn();
vi.mock('get-nonce', () => ({ setNonce, getNonce: vi.fn() }));

afterEach(cleanup);

describe('Feature: Nonce da CSP nos estilos injetados por modais (#562)', () => {
  it('Dado o nonce da requisição, Quando o Providers montar, Então o get-nonce recebe o nonce antes de qualquer diálogo', async () => {
    const { Providers } = await import('@/app/providers');
    render(<Providers nonce="abc123">filho</Providers>);
    expect(setNonce).toHaveBeenCalledWith('abc123');
  });

  it('Dado que não há nonce (ex.: dev), Quando o Providers montar, Então o get-nonce não é configurado', async () => {
    setNonce.mockClear();
    const { Providers } = await import('@/app/providers');
    render(<Providers>filho</Providers>);
    expect(setNonce).not.toHaveBeenCalled();
  });
});
