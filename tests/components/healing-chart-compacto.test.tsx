// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealingChart } from '@/components/healing-chart';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const medicoes = [
  {
    areaMm2: 100,
    painScale: 4,
    pushScore: 9,
    detScore: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    areaMm2: 50,
    painScale: 2,
    pushScore: 6,
    detScore: null,
    createdAt: '2026-01-10T00:00:00.000Z',
  },
];

function stubViewport(narrow: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: narrow,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('Feature: Gráfico de evolução legível no celular (#517)', () => {
  it('Dado celular estreito, Quando renderizar, Então o texto do gráfico tem 12 e o desenho tem altura mínima', () => {
    stubViewport(true);
    render(<HealingChart assessments={medicoes} />);

    const grafico = screen.getByRole('img', {
      name: 'Gráfico de evolução da condição',
    });
    expect(grafico).toHaveAttribute('viewBox', '0 0 280 200');
    expect(screen.getByText('100mm²')).toHaveAttribute('font-size', '12');
    expect(screen.getByText('dor /10')).toHaveAttribute('font-size', '12');
  });

  it('Dado tela larga, Quando renderizar, Então mantém a geometria de sempre', () => {
    stubViewport(false);
    render(<HealingChart assessments={medicoes} />);

    expect(
      screen.getByRole('img', { name: 'Gráfico de evolução da condição' }),
    ).toHaveAttribute('viewBox', '0 0 640 180');
    expect(screen.getByText('100mm²')).toHaveAttribute('font-size', '10');
  });

  it('Dado as três séries, Quando renderizar, Então a legenda tem uma chave por série', () => {
    stubViewport(true);
    render(<HealingChart assessments={medicoes} />);

    const legenda = screen.getByRole('list');
    expect(within(legenda).getAllByRole('listitem')).toHaveLength(3);
    expect(legenda).toHaveTextContent('Área da ferida (mm²)');
    expect(legenda).toHaveTextContent('Gravidade clínica');
    expect(legenda).toHaveTextContent('Dor (0–10)');
  });

  it('Dado só a dor medida duas vezes, Quando renderizar, Então a legenda mostra só a dor', () => {
    stubViewport(true);
    render(
      <HealingChart
        assessments={medicoes.map((m) => ({
          ...m,
          areaMm2: null,
          pushScore: null,
        }))}
      />,
    );

    const legenda = screen.getByRole('list');
    expect(within(legenda).getAllByRole('listitem')).toHaveLength(1);
    expect(legenda).toHaveTextContent('Dor (0–10)');
  });
});
