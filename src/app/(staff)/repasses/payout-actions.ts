'use server';

import { z } from 'zod';
import { CancelPayout, ClosePayout } from '@/application/billing/payouts';
import { toCommissionPayoutDto } from '@/lib/dto';
import { defineAction } from '@/lib/server/define-action';
import {
  cancelPayoutSchema,
  closePayoutSchema,
  payoutPaidAt,
} from '@/lib/server/payout-input';
import { rolesWithAccessTo } from '@/lib/staff-pages';

/**
 * Ações da tela de Repasses (#547, ADR-075): fechar e cancelar o repasse de um
 * profissional. Livro da clínica, família `administrative`: só o Admin. O
 * repasse e a trilha de auditoria gravam na MESMA transação.
 */

const PAYOUT_ADMIN_ROLES = rolesWithAccessTo('/api/commission-payouts');

/** Congela e registra o repasse do mês de um profissional; um fechamento por mês. */
export const closePayout = defineAction({
  access: { kind: 'staff', roles: PAYOUT_ADMIN_ROLES },
  input: closePayoutSchema,
  handler: async ({ input, session, tx }) => {
    const payout = await new ClosePayout({
      professionals: tx.professionals,
      producedSessions: tx.producedSessions,
      payouts: tx.commissionPayouts,
    }).execute({
      professionalId: input.professionalId,
      period: input.period,
      paidAt: payoutPaidAt(input.paidAt),
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      createdBy: session.subject,
    });
    const professional = await tx.professionals.findById(payout.professionalId);
    return toCommissionPayoutDto(payout, professional?.fullName ?? '—');
  },
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'commission-payout',
    resourceId: result.id,
    detail: `repasse ${result.period}: ${result.items.length} itens`,
  }),
});

/**
 * Cancela um repasse registrado por engano. Não apaga: marca cancelado,
 * devolve as sessões ao saldo e registra o motivo na trilha.
 */
export const cancelPayout = defineAction({
  access: { kind: 'staff', roles: PAYOUT_ADMIN_ROLES },
  input: cancelPayoutSchema.extend({ id: z.string().min(1).max(100) }),
  handler: async ({ input, session, tx }) => {
    const cancelled = await new CancelPayout(tx.commissionPayouts).execute({
      payoutId: input.id,
      reason: input.reason,
      cancelledBy: session.subject,
    });
    const professional = await tx.professionals.findById(
      cancelled.professionalId,
    );
    return toCommissionPayoutDto(cancelled, professional?.fullName ?? '—');
  },
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'commission-payout',
    resourceId: result.id,
    detail: `repasse ${result.period} cancelado: ${result.cancelReason}`,
  }),
});
