import { describe, expect, it } from 'vitest';
import { civilToday, monthsFromCivilToday } from '../../e2e/support/calendar';

/**
 * Os specs de mês (relatórios, repasses, tabelas) contam meses até o slot semeado.
 * A tela mostra o mês de APP_TIMEZONE; o relógio do runner do gate é UTC. Das 21h à
 * meia-noite em São Paulo os dois já discordam do dia, e no último dia do mês, do mês.
 */
describe('mês civil dos specs E2E (fuso do app, não o do runner)', () => {
  const SP = 'America/Sao_Paulo';
  const lateOctoberInSaoPaulo = new Date('2026-11-01T01:00:00Z');

  it('Dado 22h de 31/10 em São Paulo (01h UTC de 01/11), Quando pergunto o mês civil, Então é outubro', () => {
    expect(civilToday(lateOctoberInSaoPaulo, SP)).toEqual({
      year: 2026,
      month0: 9,
    });
  });

  it('Dado o mesmo instante, Quando conto meses até novembro, Então é 1 (e até outubro, 0)', () => {
    expect(monthsFromCivilToday(2026, 11, lateOctoberInSaoPaulo, SP)).toBe(1);
    expect(monthsFromCivilToday(2026, 10, lateOctoberInSaoPaulo, SP)).toBe(0);
  });

  it('Dado a virada de ano em São Paulo, Quando conto meses até janeiro, Então é 1', () => {
    expect(
      monthsFromCivilToday(2027, 1, new Date('2026-12-31T23:00:00Z'), SP),
    ).toBe(1);
  });
});
