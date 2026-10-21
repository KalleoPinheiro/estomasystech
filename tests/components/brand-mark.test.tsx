// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark } from '@/components/brand-mark';

describe('Feature: marca do EstomaSysTech', () => {
  it('Dado a marca sem tamanho, Quando renderizar, Então é decorativa e mede 40px', () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '40');
  });

  it('Dado tamanho e classe, Quando renderizar, Então aplica os dois', () => {
    const { container } = render(<BrandMark size={72} className="mb-3" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('height', '72');
    expect(svg).toHaveClass('mb-3');
  });
});
