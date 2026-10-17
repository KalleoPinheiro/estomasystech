import { z } from 'zod';
import { GUARDIAN_RELATIONSHIPS } from '@/domain/guardian/guardian';

export const guardianSchema = z.object({
  fullName: z.string().min(1).max(200),
  relationship: z.enum(GUARDIAN_RELATIONSHIPS),
  phone: z.string().min(1).max(50),
  email: z.string().max(200).nullish(),
});
