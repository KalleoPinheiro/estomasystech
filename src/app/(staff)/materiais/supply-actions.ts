'use server';

import { z } from 'zod';
import { CreateSupply } from '@/application/inventory/create-supply';
import { RegisterStockMovement } from '@/application/inventory/register-stock-movement';
import { UpdateSupply } from '@/application/inventory/update-supply';
import { MOVEMENT_TYPES } from '@/domain/inventory/stock-movement';
import { toSupplyDto } from '@/lib/dto';
import { defineAction } from '@/lib/server/define-action';
import { rolesWithAccessTo } from '@/lib/staff-pages';

/**
 * Ações da tela de Materiais (#556, ADR-083): Server Actions com guarda de
 * sessão e papel (os mesmos da API de insumos), `zod`, escopo de escrita e
 * auditoria na MESMA transação da gravação. A baixa automática do kit na
 * conclusão da consulta não passa por aqui (segue best-effort, ADR-078).
 */

const SUPPLY_ROLES = rolesWithAccessTo('/api/supplies');

const supplyFields = {
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(20),
  minQty: z.number().int().nonnegative().max(1_000_000),
  priceCents: z.number().int().nonnegative().max(1_000_000_000),
};

/** Cadastra um insumo. */
export const createSupply = defineAction({
  access: { kind: 'staff', roles: SUPPLY_ROLES },
  input: z.object(supplyFields),
  handler: async ({ input, tx }) =>
    toSupplyDto(await new CreateSupply(tx.supplies).execute(input)),
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'supply',
    resourceId: result.id,
    detail: 'cadastrado',
  }),
});

/** Edita os dados do insumo, ou o ativa e desativa. */
export const updateSupply = defineAction({
  access: { kind: 'staff', roles: SUPPLY_ROLES },
  input: z
    .object({
      id: z.string().min(1).max(100),
      ...supplyFields,
      active: z.boolean(),
    })
    .partial({
      name: true,
      unit: true,
      minQty: true,
      priceCents: true,
      active: true,
    }),
  handler: async ({ input, tx }) =>
    toSupplyDto(await new UpdateSupply(tx.supplies).execute(input)),
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'supply',
    resourceId: result.id,
    detail: 'editado',
  }),
});

/**
 * Entrada ou baixa de estoque, com lote e validade na entrada. O saldo, o
 * movimento e o lote gravam na mesma transação: falhou um, nenhum fica.
 */
export const registerStockMovement = defineAction({
  access: { kind: 'staff', roles: SUPPLY_ROLES },
  input: z.object({
    supplyId: z.string().min(1).max(100),
    type: z.enum(MOVEMENT_TYPES),
    quantity: z.number().int().positive().max(1_000_000),
    reason: z.string().min(1).max(500),
    appointmentId: z.string().max(100).nullish(),
    batchLabel: z.string().max(100).nullish(),
    expiresAt: z.iso.datetime().nullish(),
  }),
  handler: async ({ input, tx }) =>
    toSupplyDto(
      await new RegisterStockMovement(
        tx.supplies,
        tx.stockMovements,
        tx.appointments,
        tx.supplyBatches,
      ).execute({
        supplyId: input.supplyId,
        type: input.type,
        quantity: input.quantity,
        reason: input.reason,
        appointmentId: input.appointmentId ?? null,
        batchLabel: input.batchLabel ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      }),
    ),
  audit: ({ input, result }) => ({
    action: 'update',
    resourceType: 'supply',
    resourceId: result.id,
    detail: `${input.type === 'in' ? 'entrada' : 'baixa'} de ${input.quantity}`,
  }),
});
