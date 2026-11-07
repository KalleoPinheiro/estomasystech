// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusFilter } from '@/app/(staff)/agenda/status-filter';

afterEach(() => {
  cleanup();
});

describe('Feature: Chips de status refinados (#681)', () => {
  it('Dado a contagem, Quando renderizar, Então cada chip traz o ponto da cor do status e a contagem ao lado', () => {
    const { container } = render(
      <StatusFilter
        selected={['scheduled']}
        counts={{
          scheduled: 3,
          confirmed: 1,
          completed: 0,
          cancelled: 4,
          no_show: 2,
        }}
        onToggle={() => {}}
      />,
    );
    const chip = screen.getByRole('button', { name: 'Agendada, 3 consultas' });
    expect(chip.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(chip.textContent).toBe('Agendada 3');
    expect(container.querySelectorAll('button')).toHaveLength(5);
  });
});
