/**
 * Pacientes por página da lista. Mora fora do módulo `'use client'` de propósito:
 * a página do servidor não pode importar constante de um módulo de cliente (o
 * servidor recebe uma referência, não o valor).
 */
export const PAGE_SIZE = 100;
