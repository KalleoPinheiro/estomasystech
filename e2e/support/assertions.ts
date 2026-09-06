import { type Page, expect } from "@playwright/test";

/**
 * Toast e a região de notificações (`aria-live`) duplicam o mesmo texto pra
 * leitores de tela — sem `.first()` o locator fica ambíguo (2 elementos com o
 * mesmo texto). Já corrigido pontualmente em `portal-paciente.spec.ts` e
 * reapareceu em `agenda.spec.ts` (issue #142) — centralizado aqui pra não
 * reincidir num terceiro spec.
 */
export const expectToast = (page: Page, text: string | RegExp): Promise<void> =>
  expect(page.getByText(text).first()).toBeVisible();
