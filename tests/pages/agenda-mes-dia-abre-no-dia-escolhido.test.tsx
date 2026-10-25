// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAgendaPeriod } from '@/app/(staff)/agenda/agenda-period';

// Março de 2030: longe de «hoje», então sem escolha o dia de entrada é o dia 1.
const MARCH_2030 = new Date(2030, 2, 10);

describe('Feature: Mês → Dia abre no dia escolhido (#589)', () => {
  it('Dado um dia marcado no mês, Quando trocar para Dia, Então abre nesse dia', () => {
    const { result } = renderHook(() => useAgendaPeriod(MARCH_2030));

    act(() => result.current.chooseDay(new Date(2030, 2, 14)));
    act(() => result.current.setView('day'));

    expect(result.current.view).toBe('day');
    expect(result.current.dayDate).toEqual(new Date(2030, 2, 14));
    expect(result.current.from).toEqual(new Date(2030, 2, 14));
  });

  it('Dado um dia marcado, Quando trocar para Semana, Então abre na semana desse dia', () => {
    const { result } = renderHook(() => useAgendaPeriod(MARCH_2030));

    act(() => result.current.chooseDay(new Date(2030, 2, 14)));
    act(() => result.current.setView('week'));

    expect(result.current.weekStart).toEqual(new Date(2030, 2, 10));
  });

  it('Dado nenhum dia marcado, Quando trocar para Dia, Então abre no dia 1 do mês', () => {
    const { result } = renderHook(() => useAgendaPeriod(MARCH_2030));

    act(() => result.current.setView('day'));

    expect(result.current.dayDate).toEqual(new Date(2030, 2, 1));
  });

  it('Dado um dia marcado, Quando mudar de mês e trocar para Dia, Então a escolha antiga é descartada', () => {
    const { result } = renderHook(() => useAgendaPeriod(MARCH_2030));

    act(() => result.current.chooseDay(new Date(2030, 2, 14)));
    act(() => result.current.shift(1));
    act(() => result.current.setView('day'));

    expect(result.current.dayDate).toEqual(new Date(2030, 3, 1));
  });

  it('Dado um dia marcado, Quando ir a Dia e voltar a Mês, Então o mês é o do dia escolhido', () => {
    const { result } = renderHook(() => useAgendaPeriod(MARCH_2030));

    act(() => result.current.chooseDay(new Date(2030, 2, 14)));
    act(() => result.current.setView('day'));
    act(() => result.current.setView('month'));

    expect(result.current.monthDate).toEqual(new Date(2030, 2, 1));
  });
});
