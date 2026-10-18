import { describe, expect, it } from 'vitest';
import { NullEmailGateway } from '@/application/ports/email-gateway';
import { findInviteUrl } from '../../e2e/support/invite-log';

/**
 * O `global-setup` do E2E alcança o convite das contas por papel pelo log do
 * `NullEmailGateway` (#204). Os blocos abaixo saem do próprio gateway — se o
 * formato do log mudar, o parser quebra aqui, não no E2E.
 */
const block = async (email: string, token: string): Promise<string> => {
  const lines: string[] = [];
  const original = console.info;
  console.info = (line: string) => lines.push(line);
  try {
    await new NullEmailGateway().send({
      to: email,
      subject: 'Convite para o EstomaSysTech',
      text:
        `Olá! Defina sua senha em http://localhost:3000/definir-senha?token=${token}\n` +
        'O link expira em 24 horas.',
    });
  } finally {
    console.info = original;
  }
  return `${lines.join('\n')}\n`;
};

describe('Feature: link do convite no log do servidor E2E', () => {
  it('Dado blocos de vários e-mails, Então devolve o link do e-mail pedido', async () => {
    const log =
      (await block('a@estomasystech.test', 'tok-a')) +
      'GET /api/patients 200\n' +
      (await block('bruno@estomasystech.test', 'tok_b'));

    expect(findInviteUrl(log, 'bruno@estomasystech.test')).toBe(
      'http://localhost:3000/definir-senha?token=tok_b',
    );
  });

  it('Dado dois convites do mesmo e-mail, Então devolve o último', async () => {
    const log =
      (await block('a@estomasystech.test', 'velho')) +
      (await block('a@estomasystech.test', 'novo'));

    expect(findInviteUrl(log, 'a@estomasystech.test')).toBe(
      'http://localhost:3000/definir-senha?token=novo',
    );
  });

  it('Dado e-mail de outro domínio com a mesma máscara local, Então não confunde as contas', async () => {
    const log = await block('a@estomasystech.test.br', 'outro');

    expect(findInviteUrl(log, 'a@estomasystech.test')).toBeNull();
  });

  it('Dado log sem convite do e-mail, Então devolve null', () => {
    expect(
      findInviteUrl('servidor pronto\n', 'a@estomasystech.test'),
    ).toBeNull();
  });

  it('Dado o bloco do gateway nulo, Então o e-mail completo e o corpo não aparecem no log', async () => {
    const log = await block('e2e-atendente@estomasystech.test', 'tok');

    expect(log).not.toContain('e2e-atendente@estomasystech.test');
    expect(log).not.toContain('expira');
  });
});
