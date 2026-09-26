/**
 * Link do convite de `email` no log do servidor principal. Sem canal de e-mail,
 * o `NullEmailGateway` (`src/application/ports/email-gateway.ts`) imprime
 * "[e-mail desativado] Para <email> — <assunto>" seguido do corpo com o link;
 * o último bloco daquele e-mail é o convite vigente (emitir de novo invalida o
 * anterior).
 *
 * Módulo puro (sem `@playwright/test`) para o Vitest provar o parsing em
 * `tests/e2e/invite-log.test.ts`.
 */
const BLOCK_MARKER = "[e-mail desativado] Para ";
const INVITE_LINK = /https?:\/\/\S+\/definir-senha\?token=[\w-]+/;

export function findInviteUrl(log: string, email: string): string | null {
  const blocks = log.split(BLOCK_MARKER).slice(1);
  const mine = blocks.filter((block) => block.startsWith(`${email} `));
  const match = mine.at(-1)?.match(INVITE_LINK);
  return match ? match[0] : null;
}
