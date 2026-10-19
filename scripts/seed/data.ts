import { fakerPT_BR as faker } from "@faker-js/faker";

/**
 * Geradores de dado FICTÍCIO para homologação (ADR-041). Determinísticos:
 * `faker.seed(SEED)` + data de referência fixa => mesma massa a cada execução.
 * Pacote `@faker-js/faker` fixado em versão exata; o pacote sem escopo `faker`
 * (sabotado em 2022) não pode entrar no projeto.
 */
export const SEED = 20261019;

export function initFaker(referenceDate: Date): void {
  faker.seed(SEED);
  faker.setDefaultRefDate(referenceDate);
}

function cpfDigit(base: number[]): number {
  const factor = base.length + 1;
  const sum = base.reduce((acc, digit, i) => acc + digit * (factor - i), 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** CPF válido (dígitos verificadores corretos), de pessoa que não existe. */
export function fakeCpf(): string {
  const base = Array.from({ length: 9 }, () => faker.number.int({ min: 0, max: 9 }));
  // Evita sequência repetida (000...), que o domínio recusa.
  if (new Set(base).size === 1) {
    base[0] = (base[0] + 1) % 10;
  }
  const first = cpfDigit(base);
  const second = cpfDigit([...base, first]);
  return [...base, first, second].join("");
}

export function fakePhone(): string {
  return `119${faker.string.numeric(8)}`;
}

export function fakePersonName(): string {
  return faker.person.fullName();
}

/** E-mail em domínio reservado: nunca entrega para ninguém. */
export function fakeEmail(name: string, index: number): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return `${slug}.${index}@homologacao.invalid`;
}

export function pick<T>(items: readonly T[]): T {
  return faker.helpers.arrayElement(items);
}

export function int(min: number, max: number): number {
  return faker.number.int({ min, max });
}

export function birthDateForAge(age: number, referenceDate: Date): Date {
  const date = new Date(referenceDate);
  date.setUTCFullYear(date.getUTCFullYear() - age);
  date.setUTCDate(date.getUTCDate() - int(0, 300));
  return date;
}

export const PROCEDURES = [
  { name: "Avaliação inicial de ferida", priceCents: 18000, durationMinutes: 60 },
  { name: "Curativo simples", priceCents: 9000, durationMinutes: 30 },
  { name: "Curativo com desbridamento", priceCents: 22000, durationMinutes: 60 },
  { name: "Terapia compressiva", priceCents: 16000, durationMinutes: 45 },
  { name: "Troca de bolsa de estomia", priceCents: 12000, durationMinutes: 30 },
  { name: "Orientação de autocuidado", priceCents: 8000, durationMinutes: 30 },
] as const;

export const SUPPLIES = [
  { name: "Hidrocoloide 10x10", unit: "un", minQty: 10, priceCents: 1800, stock: "ok" },
  { name: "Alginato de cálcio 10x10", unit: "un", minQty: 10, priceCents: 2600, stock: "ok" },
  { name: "Espuma com prata 10x10", unit: "un", minQty: 8, priceCents: 4200, stock: "low" },
  { name: "Bolsa de colostomia 1 peça", unit: "un", minQty: 12, priceCents: 3500, stock: "expired" },
  { name: "Pó protetor de pele", unit: "fr", minQty: 4, priceCents: 5200, stock: "zero" },
  { name: "Solução fisiológica 250 ml", unit: "fr", minQty: 20, priceCents: 600, stock: "ok" },
] as const;
