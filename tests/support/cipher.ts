import { DataCipher } from '@/lib/data-cipher';

/** Chave de dados fixa dos testes de repositório (#195) — nunca usada fora da suíte. */
export const TEST_CIPHER = new DataCipher({
  current: 'chave-de-dados-somente-para-testes-0001',
});
