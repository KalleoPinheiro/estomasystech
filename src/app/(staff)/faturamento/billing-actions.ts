'use server';

import { z } from 'zod';
import { CreateInvoice } from '@/application/billing/create-invoice';
import { SellSessionPackage } from '@/application/billing/sell-session-package';
import { toInvoiceDto } from '@/lib/dto';
import { defineAction } from '@/lib/server/define-action';
import {
  applyInvoiceAction,
  INVOICE_AUDIT_DETAIL,
  invoiceActionSchema,
} from '@/lib/server/invoice-actions';
import { rolesWithAccessTo } from '@/lib/staff-pages';

/**
 * Ações da tela de Faturamento (#547, ADR-069 § 2, ADR-075): Server Actions com
 * guarda de sessão e papel (os mesmos da API de faturas), `zod`, escopo de
 * escrita e auditoria na MESMA transação da gravação. A tela se atualiza por
 * `refresh()` dentro do `defineAction`.
 */

const BILLING_ROLES = rolesWithAccessTo('/api/invoices');

const createInvoiceSchema = z.object({
  patientId: z.string().min(1),
  description: z.string().min(1).max(500),
  amountCents: z.number().int().positive().max(1_000_000_000),
  appointmentId: z.string().nullish(),
  dueDate: z.iso.datetime().nullish(),
});

/** Emite uma fatura avulsa para o paciente. */
export const createInvoice = defineAction({
  access: { kind: 'staff', roles: BILLING_ROLES },
  input: createInvoiceSchema,
  handler: async ({ input, tx }) =>
    toInvoiceDto(
      await new CreateInvoice(tx.invoices, tx.patients).execute({
        patientId: input.patientId,
        description: input.description,
        amountCents: input.amountCents,
        appointmentId: input.appointmentId ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      }),
    ),
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'invoice',
    resourceId: result.id,
    patientId: result.patientId,
    detail: 'emitida',
  }),
});

/**
 * Quita, recebe parte, aplica desconto ou cancela a fatura. A leitura trava a
 * linha dentro da transação: duas ações simultâneas na mesma fatura viram fila,
 * e a segunda vê o saldo já atualizado, nunca recebimento em dobro (#192).
 */
export const updateInvoice = defineAction({
  access: { kind: 'staff', roles: BILLING_ROLES },
  input: z.object({
    id: z.string().min(1).max(100),
    change: invoiceActionSchema,
  }),
  handler: async ({ input, tx }) => {
    const updated = await applyInvoiceAction(
      tx.invoices,
      input.id,
      input.change,
    );
    return toInvoiceDto(updated);
  },
  audit: ({ input, result }) => ({
    action: 'update',
    resourceType: 'invoice',
    resourceId: result.id,
    patientId: result.patientId,
    detail: INVOICE_AUDIT_DETAIL[input.change.action],
  }),
});

const sellPackageSchema = z.object({
  patientId: z.string().min(1),
  procedureId: z.string().min(1),
  totalSessions: z.number().int().min(1).max(100),
  priceCents: z.number().int().min(0).max(1_000_000_000),
  /** Validade opcional (COMP3-07). */
  expiresAt: z.iso.datetime().nullish(),
});

/**
 * Vende um pacote de sessões (O3.3): pacote e fatura da venda gravam juntos e a
 * auditoria entra na mesma transação. O caso de uso abre a «própria» unidade de
 * trabalho; aqui ela é a transação da ação, então o pacote, a fatura e a trilha
 * persistem ou nenhum persiste.
 */
export const sellPackage = defineAction({
  access: { kind: 'staff', roles: BILLING_ROLES },
  input: sellPackageSchema,
  handler: async ({ input, tx }) => {
    const sold = await new SellSessionPackage(tx.patients, tx.procedures, {
      run: (work) => work(tx),
    }).execute({
      ...input,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
    return {
      id: sold.package.id,
      patientId: sold.package.patientId,
      totalSessions: sold.package.totalSessions,
    };
  },
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'session-package',
    resourceId: result.id,
    patientId: result.patientId,
    detail: `pacote de ${result.totalSessions} sessões vendido`,
  }),
});
