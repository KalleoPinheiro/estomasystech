// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STAGING_BANNER_HEIGHT_VAR,
  StagingBannerOffset,
} from '@/components/staging-banner-offset';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty(STAGING_BANNER_HEIGHT_VAR);
});

describe('Feature: menu desconta a faixa de homologação (QA staging)', () => {
  it('Dado a faixa na tela, Quando montar, Então publica a altura e limpa ao sair', () => {
    let notify: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 54 } as DOMRect);

    const { unmount } = render(
      <StagingBannerOffset>faixa</StagingBannerOffset>,
    );
    expect(
      document.documentElement.style.getPropertyValue(
        STAGING_BANNER_HEIGHT_VAR,
      ),
    ).toBe('54px');

    spy.mockReturnValue({ height: 80 } as DOMRect);
    notify();
    expect(
      document.documentElement.style.getPropertyValue(
        STAGING_BANNER_HEIGHT_VAR,
      ),
    ).toBe('80px');

    unmount();
    expect(
      document.documentElement.style.getPropertyValue(
        STAGING_BANNER_HEIGHT_VAR,
      ),
    ).toBe('');
    spy.mockRestore();
  });
});

describe('Feature: faixa de homologação sem ResizeObserver', () => {
  it('Dado navegador sem ResizeObserver, Quando montar, Então mede uma vez e não quebra', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 40,
    } as DOMRect);

    const { unmount } = render(
      <StagingBannerOffset>faixa</StagingBannerOffset>,
    );
    expect(
      document.documentElement.style.getPropertyValue(
        STAGING_BANNER_HEIGHT_VAR,
      ),
    ).toBe('40px');
    unmount();
    vi.restoreAllMocks();
  });
});
