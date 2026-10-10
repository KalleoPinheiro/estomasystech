import { z } from 'zod';
import { EMAIL_PROVIDERS } from '@/domain/clinic/clinic-channel';

/**
 * Corpo do `PUT /api/settings/email-channel` (C3). Formato do remetente e
 * chave obrigatória no 1º salvamento são regra do domínio (`ClinicChannel`).
 */
export const emailChannelInputSchema = z.object({
  provider: z.enum(EMAIL_PROVIDERS),
  sender: z.string().max(320),
  apiKey: z.string().max(500).nullish(),
});
