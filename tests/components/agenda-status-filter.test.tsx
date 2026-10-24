// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusFilter } from '@/app/(staff)/agenda/status-filter';

afterEach(() => {
  cleanup();
});

const COUNTS = {
  scheduled: 3,
  confirmed: 1,
  completed: 0,
  cancelled: 4,
  no_show: 2,
};

describe('Feature: Chips de status da agenda (#538)', () => {
  it('AGE-FLT-05: Dado a contagem do período, Quando renderizar, Então cada chip mostra rótulo e contagem', () => {
    render(
      <StatusFilter
        selected={['scheduled']}
        counts={COUNTS}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Agendada 3' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Faltou 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelada 4' })).toBeTruthy();
  });

  it('Dado a contagem ainda carregando, Quando renderizar, Então só o rótulo', () => {
    render(
      <StatusFilter
        selected={['scheduled']}
        counts={null}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Agendada' })).toBeTruthy();
  });

  it('AGE-FLT-01: Dado dois status marcados, Quando renderizar, Então aria-pressed só neles', () => {
    render(
      <StatusFilter
        selected={['confirmed', 'no_show']}
        counts={COUNTS}
        onToggle={() => {}}
      />,
    );
    const pressed = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed');
    expect(pressed('Confirmada 1')).toBe('true');
    expect(pressed('Faltou 2')).toBe('true');
    expect(pressed('Agendada 3')).toBe('false');
  });

  it('Dado um chip, Quando clicar, Então avisa qual status alternar', () => {
    const onToggle = vi.fn();
    render(<StatusFilter selected={[]} counts={COUNTS} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Concluída 0' }));
    expect(onToggle).toHaveBeenCalledWith('completed');
  });
});
