/**
 * Ponto de entrada de datas dos specs. A lógica pura (dias úteis, seeds e slots)
 * mora em `./slots` — sem `@playwright/test`, para o Vitest verificar colisões.
 */

import { test } from "@playwright/test";
import { type Slot, type SlotSeed, slotFromSeed } from "./slots";

export * from "./slots";

/**
 * Slot da tentativa atual do Playwright. Use no lugar de `slotFromSeed` em todo
 * teste que cria consulta pela API: na 1ª tentativa devolve exatamente o mesmo
 * slot de sempre; em re-tentativa devolve um slot livre por construção.
 */
export function slotForAttempt(seed: SlotSeed, durationMinutes = 60): Slot {
  return slotFromSeed(seed, { durationMinutes, attempt: test.info().retry });
}
