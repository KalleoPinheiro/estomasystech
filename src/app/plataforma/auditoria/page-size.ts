/**
 * Eventos por página da trilha da plataforma. Mora fora do módulo `'use client'`
 * de propósito: a página do servidor não pode importar constante de um módulo de
 * cliente (o servidor recebe uma referência, não o valor) — #878.
 */
export const PAGE_SIZE = 100;
