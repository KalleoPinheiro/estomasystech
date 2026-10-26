// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAgendaPeriod } from '@/app/(staff)/agenda/agenda-period';
import { parseAgendaQuery } from '@/app/(staff)/agenda/agenda-range';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

// Março de 2030: longe de «hoje», então sem escolha o dia de entrada é o dia 1.
const MARCH_2030 = '/agenda?dia=2030-03-10';

/** O recorte da URL é a fonte do período: o hook navega e a página relê a URL nova. */
function renderPeriod(url: string) {
  const fromUrl = (href: string) =>
    parseAgendaQuery(Object.fromEntries(new URL(href, 'http://x').searchParams))
      .query;
  const hook = renderHook(({ href }) => useAgendaPeriod(fromUrl(href)), {
    initialProps: { href: url },
  });
  /** Segue a última navegação pedida, como o Next faz ao trocar a URL. */
  const follow = () =>
    hook.rerender({ href: router.push.mock.calls.at(-1)?.[0] as string });
  return { ...hook, follow };
}

describe('Feature: Mês → Dia abre no dia escolhido (#591)', () => {
  it('Dado um dia marcado no mês, Quando trocar para Dia, Então abre nesse dia', () => {
    const { result, follow } = renderPeriod(MARCH_2030);

    act(() => result.current.chooseDay(new Date(2030, 2, 14)));
    act(() => result.current.setView('day'));
    follow();

    expect(result.current.view).toBe('day');
    expect(result.current.dayDate).toEqual(new Date(2030, 2, 14));
    expect(result.current.from).toEqual(new Date(2030, 2, 14));
  });

  it('Dado um dia marcado, Quando trocar para Semana, Então abre na semana desse dia', () => {
    const { result, follow } = renderPeriod(MARCH_2030);

    act(() => result.current.chooseDay(new Date(2030, 2, 14)));
    act(() => result.current.setView('week'));
    follow();

    expect(result.current.weekStart).toEqual(new Date(2030, 2, 10));
  });

  it('Dado nenhum dia marcado, Quando trocar para Dia, Então abre no dia 1 do mês', () => {
    const { result, follow } = renderPeriod(MARCH_2030);

    act(() => result.current.setView('day'));
    follow();

    expect(result.current.dayDate).toEqual(new Date(2030, 2, 1));
  });

  it('Dado um dia marcado, Quando mudar de mês e trocar para Dia, Então a escolha antiga é descartada', () => {
    const { result, follow } = renderPeriod(MARCH_2030);

    act(() => result.current.chooseDay(new Date(2030, 2, 14)));
    act(() => result.current.shift(1));
    follow();
    act(() => result.current.setView('day'));
    follow();

    expect(result.current.dayDate).toEqual(new Date(2030, 3, 1));
  });

  it('Dado um dia marcado, Quando ir a Dia e voltar a Mês, Então o mês é o do dia escolhido', () => {
    const { result, follow } = renderPeriod(MARCH_2030);

    act(() => result.current.chooseDay(new Date(2030, 2, 14)));
    act(() => result.current.setView('day'));
    follow();
    act(() => result.current.setView('month'));
    follow();

    expect(result.current.monthDate).toEqual(new Date(2030, 2, 1));
  });
});
