import { createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

/**
 * Réplica do TOTP de `src/domain/auth/totp.ts` (RFC 6238: SHA-1, 6 dígitos,
 * passo de 30 s). Mesmo motivo de `session-token.ts`: o E2E não importa código
 * da app. O `global-setup` cadastra o segundo fator do Super Admin e grava a
 * chave aqui; o `auth.spec.ts` lê para digitar o código na tela.
 */
export const SUPER_ADMIN_TOTP_PATH = "e2e/.auth/super-admin-totp.json";

const STEP_MS = 30_000;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const totpStep = (nowMs: number = Date.now()): number => Math.floor(nowMs / STEP_MS);

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

interface TotpState {
  secret: string;
  lastUsedStep: number;
}

export const saveTotpState = (state: TotpState): Promise<void> =>
  writeFile(SUPER_ADMIN_TOTP_PATH, JSON.stringify(state));

/**
 * Próximo código aceito pelo servidor: o mesmo passo não entra duas vezes
 * (`last_used_step`), então usa o passo atual ou o seguinte (janela ±1) e,
 * se os dois já foram usados, espera o passo virar.
 */
export async function nextTotpCode(): Promise<string> {
  const state = JSON.parse(await readFile(SUPER_ADMIN_TOTP_PATH, "utf-8")) as TotpState;
  let step = Math.max(totpStep(), state.lastUsedStep + 1);
  while (step > totpStep() + 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    step = Math.max(totpStep(), state.lastUsedStep + 1);
  }
  await saveTotpState({ ...state, lastUsedStep: step });
  return totpCode(state.secret, step);
}
