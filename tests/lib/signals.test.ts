import { afterEach, describe, expect, it } from 'vitest';
import {
  countSignals,
  recordSignal,
  resetSignals,
} from '@/lib/observability/signals';

describe('Sinais de alerta em memória (#212)', () => {
  afterEach(() => {
    resetSignals();
  });

  it('Dado eventos dentro e fora da janela, Quando conta, Então só os da janela', () => {
    recordSignal('server-error', 1_000);
    recordSignal('server-error', 5_000);
    recordSignal('delivery-failure', 5_000);

    expect(countSignals('server-error', 2_000)).toBe(1);
    expect(countSignals('server-error', 0)).toBe(2);
    expect(countSignals('delivery-failure', 0)).toBe(1);
  });

  it('Dado evento com mais de uma hora, Quando chega outro, Então o antigo é descartado', () => {
    recordSignal('server-error', 0);
    recordSignal('server-error', 60 * 60_000 + 1);

    expect(countSignals('server-error', 0)).toBe(1);
  });
});
