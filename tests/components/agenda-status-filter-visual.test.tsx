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

  it('Dado a agenda aberta, Quando olho Cancelada e Confirmada marcada, Então o ponto tem preenchimento sólido da tinta do estado e não usa borda nem o tom do fundo do chip (#707)', () => {
    const { container } = render(
      <StatusFilter
        selected={['confirmed']}
        counts={{
          scheduled: 0,
          confirmed: 1,
          completed: 0,
          cancelled: 4,
          no_show: 0,
        }}
        onToggle={() => {}}
      />,
    );
    const dot = (name: string) =>
      screen.getByRole('button', { name }).querySelector('[aria-hidden]');
    for (const name of ['Cancelada, 4 consultas', 'Confirmada, 1 consulta']) {
      const classes = dot(name)?.className ?? '';
      expect(classes).not.toMatch(/\bborder\b|-soft|bg-surface/);
    }
    expect(dot('Cancelada, 4 consultas')?.className).toContain('bg-ink-3');
    expect(dot('Confirmada, 1 consulta')?.className).toContain('bg-accent-ink');
    expect(
      screen.getByRole('button', { name: 'Confirmada, 1 consulta' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(5);
  });
});
