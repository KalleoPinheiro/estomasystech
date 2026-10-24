// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HealingChart } from '@/components/healing-chart';

afterEach(cleanup);

const at = (id: string, createdAt: string, areaMm2: number) => ({
  id,
  areaMm2,
  painScale: null,
  pushScore: null,
  detScore: null,
  createdAt,
});

describe('Feature: tendência só quando a ordem das medições é certa (#473)', () => {
  it('Dado primeira e última medição em instantes diferentes, Quando renderizar, Então mostra a redução', () => {
    render(
      <HealingChart
        assessments={[
          at('a', '2026-10-01T10:00:00.000Z', 2520),
          at('b', '2026-10-08T10:00:00.000Z', 280),
        ]}
      />,
    );

    expect(
      screen.getByText('Área reduziu 89% desde a primeira medição'),
    ).toBeInTheDocument();
  });

  it('Dado todas as medições no mesmo instante, Quando renderizar, Então não afirma redução nem aumento', () => {
    const same = '2026-10-19T19:24:00.000Z';
    render(
      <HealingChart
        assessments={[
          at('a', same, 280),
          at('b', same, 630),
          at('c', same, 2520),
        ]}
      />,
    );

    expect(screen.queryByText(/Área reduziu/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Área aumentou/)).not.toBeInTheDocument();
  });

  it('Dado as duas últimas medições no mesmo instante, Quando renderizar, Então não afirma a tendência', () => {
    render(
      <HealingChart
        assessments={[
          at('a', '2026-10-01T10:00:00.000Z', 2520),
          at('b', '2026-10-08T10:00:00.000Z', 280),
          at('c', '2026-10-08T10:00:00.000Z', 3000),
        ]}
      />,
    );

    expect(
      screen.queryByText(/Área (reduziu|aumentou)/),
    ).not.toBeInTheDocument();
  });

  it('Dado cinco medições lançadas no mesmo dia em instantes ligeiramente diferentes, Quando renderizar, Então não afirma a tendência (#473, portal)', () => {
    render(
      <HealingChart
        assessments={[
          at('a', '2026-10-19T19:24:00.000Z', 2520),
          at('b', '2026-10-19T19:24:01.000Z', 1800),
          at('c', '2026-10-19T19:24:02.000Z', 900),
          at('d', '2026-10-19T19:24:03.000Z', 500),
          at('e', '2026-10-19T19:24:04.000Z', 280),
        ]}
      />,
    );

    expect(
      screen.queryByText(/Área (reduziu|aumentou)/),
    ).not.toBeInTheDocument();
  });
});
