import { readFile } from "node:fs/promises";
import { MAIN_SERVER_LOG_PATH } from "./constants";
import { findInviteUrl } from "./invite-log";

const INVITE_WAIT_MS = 15_000;
const INVITE_POLL_MS = 250;

/** Log do servidor principal (`tee` do `playwright.config.ts`); vazio se não existir. */
export const readServerLog = (): Promise<string> =>
  readFile(MAIN_SERVER_LOG_PATH, "utf-8").catch(() => "");

/**
 * `logStart` é o tamanho do log antes de pedir o convite: o destinatário sai
 * mascarado no log e as contas por papel colidem na máscara, então só o que
 * foi escrito depois do pedido identifica o convite certo.
 */
export async function waitForInviteUrl(email: string, logStart: number): Promise<string> {
  const deadline = Date.now() + INVITE_WAIT_MS;
  while (Date.now() < deadline) {
    const log = await readServerLog();
    const url = findInviteUrl(log.slice(logStart), email);
    if (url) return url;
    await new Promise((resolve) => setTimeout(resolve, INVITE_POLL_MS));
  }
  throw new Error(
    `Convite de ${email} não apareceu em ${MAIN_SERVER_LOG_PATH} em ${INVITE_WAIT_MS}ms. ` +
      "O servidor principal precisa ser o do playwright.config.ts (grava o log via tee) " +
      "e rodar sem RESEND_API_KEY/EMAIL_FROM.",
  );
}
