// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HydrationMark } from '@/components/hydration-mark';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.hydrated;
});

describe('Feature: marca de hidratação (#484)', () => {
  it('Dado a página sem hidratar, Quando o React monta, Então o html ganha data-hydrated', () => {
    expect(document.documentElement.dataset.hydrated).toBeUndefined();
    render(<HydrationMark />);
    expect(document.documentElement.dataset.hydrated).toBe('true');
  });
});
