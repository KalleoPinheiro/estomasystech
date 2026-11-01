'use server';

import { z } from 'zod';
import { NotFoundError } from '@/domain/shared/errors';
import { toProcedureDto } from '@/lib/dto';
import { defineAction } from '@/lib/server/define-action';
import {
  createProcedureRecord,
  updateProcedureRecord,
} from '@/lib/server/procedure-writes';
import { rolesWithAccessTo } from '@/lib/staff-pages';

/**
 * Ações da tela de Procedimentos (#556, ADR-083): Server Actions com guarda de
 * sessão e papel (os mesmos da API de procedimentos), `zod`, escopo de escrita
 * e auditoria na MESMA transação da gravação. A regra de nome repetido e de
 * edição é a das rotas (`procedure-writes.ts`).
 */

const PROCEDURE_ROLES = rolesWithAccessTo('/api/procedures');

const procedureFields = {
  name: z.string().min(1).max(200),
  priceCents: z.number().int().min(0).max(1_000_000_000),
  durationMinutes: z.number().int().min(1).max(480),
};

/** Cadastra um procedimento no catálogo. */
export const createProcedure = defineAction({
  access: { kind: 'staff', roles: PROCEDURE_ROLES },
  input: z.object(procedureFields),
  handler: async ({ input, tx }) =>
    toProcedureDto(await createProcedureRecord(tx.procedures, input)),
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'procedure',
    resourceId: result.id,
    detail: 'cadastrado',
  }),
});

/** Edita nome, preço e duração, ou ativa e desativa o procedimento. */
export const updateProcedure = defineAction({
  access: { kind: 'staff', roles: PROCEDURE_ROLES },
  input: z
    .object({
      id: z.string().min(1).max(100),
      ...procedureFields,
      active: z.boolean(),
    })
    .partial({
      name: true,
      priceCents: true,
      durationMinutes: true,
      active: true,
    }),
  handler: async ({ input: { id, ...change }, tx }) =>
    toProcedureDto(await updateProcedureRecord(tx.procedures, id, change)),
  audit: ({ input, result }) => ({
    action: 'update',
    resourceType: 'procedure',
    resourceId: result.id,
    detail:
      input.active === undefined
        ? 'editado'
        : input.active
          ? 'reativado'
          : 'desativado',
  }),
});

/**
 * Substitui o kit de insumos do procedimento. Insumo de outra empresa não entra
 * (a baixa automática debitaria o estoque dela). Kit e trilha gravam juntos.
 */
export const setProcedureKit = defineAction({
  access: { kind: 'staff', roles: PROCEDURE_ROLES },
  input: z.object({
    procedureId: z.string().min(1).max(100),
    items: z
      .array(
        z.object({
          supplyId: z.string().min(1).max(100),
          quantity: z.number().int().min(1).max(1000),
        }),
      )
      .max(50),
  }),
  handler: async ({ input, tx }) => {
    if (!(await tx.procedures.findById(input.procedureId))) {
      throw new NotFoundError('Procedimento', input.procedureId);
    }
    const found = await Promise.all(
      input.items.map((item) => tx.supplies.findById(item.supplyId)),
    );
    const missing = input.items.find((_, index) => !found[index]);
    if (missing) throw new NotFoundError('Insumo', missing.supplyId);
    await tx.procedureKits.setKit(input.procedureId, input.items);
    return { procedureId: input.procedureId, items: input.items.length };
  },
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'procedure',
    resourceId: result.procedureId,
    detail: `kit com ${result.items} ${result.items === 1 ? 'item' : 'itens'}`,
  }),
});
