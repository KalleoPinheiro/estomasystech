// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusBadge } from '@/components/status-badge';

afterEach(() => {
  cleanup();
});

describe('Selo de status: className (#879)', () => {
  it('Dado um className, Quando renderizar, Então o selo o recebe', () => {
    render(
      <StatusBadge
        status="pending"
        label="Aguardando"
        className="meu-ajuste"
      />,
    );
    expect(screen.getByText('Aguardando').className).toContain('meu-ajuste');
  });
});
