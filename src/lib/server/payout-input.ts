import { z } from 'zod';
import { PAYOUT_METHODS } from '@/domain/billing/commission-payout';
import { zonedInstant } from '@/domain/shared/time-zone';
import { PAYOUT_PERIOD_REGEX } from '@/lib/dto';

/**
 * Entrada do fechamento e do cancelamento de repasse: o mesmo contrato de
 * `POST /api/commission-payouts` e das Server Actions da tela de Repasses.
 */
export const closePayoutSchema = z.object({
  professionalId: z.string().min(1).max(100),
  period: z
    .string()
    .regex(PAYOUT_PERIOD_REGEX, 'Mês deve estar no formato AAAA-MM'),
  paidAt: z.iso.date(),
  paymentMethod: z.enum(PAYOUT_METHODS),
  notes: z.string().max(1000).nullish(),
});

export const cancelPayoutSchema = z.object({ reason: z.string().max(1000) });

/** Data do pagamento ao meio-dia da clínica: não «volta» um dia em UTC. */
export const payoutPaidAt = (paidAt: string): Date =>
  zonedInstant(
    ...(paidAt.split('-').map(Number) as [number, number, number]),
    12,
  );
