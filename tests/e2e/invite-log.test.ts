import { describe, expect, it } from 'vitest';
import { findInviteUrl } from '../../e2e/support/invite-log';

/**
 * O `global-setup` do E2E alcança o convite das contas por papel pelo log do
 * `NullEmailGateway` (#204) — o formato abaixo é o que ele imprime.
 */
const block = (email: string, token: string) =>
  `[e-mail desativado] Para ${email} — Convite para o VittaFlow\n` +
  `Olá! Defina sua senha em http://localhost:3000/definir-senha?token=${token}\n` +
  'O link expira em 24 horas.\n';

describe('Feature: link do convite no log do servidor E2E', () => {
  it('Dado blocos de vários e-mails, Então devolve o link do e-mail pedido', () => {
    const log =
      block('a@vitta.test', 'tok-a') +
      'GET /api/patients 200\n' +
      block('b@vitta.test', 'tok_b');

    expect(findInviteUrl(log, 'b@vitta.test')).toBe(
      'http://localhost:3000/definir-senha?token=tok_b',
    );
  });

  it('Dado dois convites do mesmo e-mail, Então devolve o último', () => {
    const log = block('a@vitta.test', 'velho') + block('a@vitta.test', 'novo');

    expect(findInviteUrl(log, 'a@vitta.test')).toBe(
      'http://localhost:3000/definir-senha?token=novo',
    );
  });

  it('Dado e-mail que é prefixo de outro, Então não confunde as contas', () => {
    const log = block('a@vitta.test.br', 'outro');

    expect(findInviteUrl(log, 'a@vitta.test')).toBeNull();
  });

  it('Dado log sem convite do e-mail, Então devolve null', () => {
    expect(findInviteUrl('servidor pronto\n', 'a@vitta.test')).toBeNull();
  });
});
