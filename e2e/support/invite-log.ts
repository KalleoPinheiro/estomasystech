import { maskEmail } from "../../src/lib/redact";

/**
 * Link do convite de `email` no log do servidor principal. Sem canal de e-mail,
 * o `NullEmailGateway` (`src/application/ports/email-gateway.ts`) imprime
 * "[e-mail desativado] Para <e-mail mascarado> — <assunto>" e, fora de
 * produção, o link de senha no campo `link` da mesma linha JSON (#212) — nunca
 * o e-mail completo nem o corpo (CWE-532).
 *
 * Como o e-mail sai mascarado (`e2e-atendente@…` e `e2e-profissional@…` viram
 * ambos `e2***@estomasystech.test`), o chamador passa só o trecho do log escrito depois
 * de pedir o convite; dentro dele vale o último bloco daquele destinatário
 * (emitir de novo invalida o anterior).
 *
 * Módulo puro (sem `@playwright/test`) para o Vitest provar o parsing em
 * `tests/e2e/invite-log.test.ts`.
 */
const BLOCK_MARKER = "[e-mail desativado] Para ";
const INVITE_LINK = /https?:\/\/\S+\/definir-senha\?token=[\w-]+/;

export function findInviteUrl(logSinceRequest: string, email: string): string | null {
  const recipient = `${maskEmail(email)} `;
  const blocks = logSinceRequest.split(BLOCK_MARKER).slice(1);
  const mine = blocks.filter((block) => block.startsWith(recipient));
  const match = mine.at(-1)?.match(INVITE_LINK);
  return match ? match[0] : null;
}
