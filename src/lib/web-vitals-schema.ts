import { z } from 'zod';
import {
  MAX_WIDTH,
  WEB_VITAL_NAMES,
  WEB_VITAL_RATINGS,
} from '@/lib/web-vitals';

const metricSchema = z
  .object({
    name: z.enum(WEB_VITAL_NAMES),
    value: z.number().finite().min(0).max(1_000_000),
    rating: z.enum(WEB_VITAL_RATINGS).optional(),
  })
  .strict();

/** Corpo do envio de campo: uma rota, uma largura e até uma medida por métrica. */
export const webVitalsPayloadSchema = z
  .object({
    route: z.string().min(1).max(512),
    width: z.number().finite().min(0).max(MAX_WIDTH),
    metrics: z.array(metricSchema).min(1).max(WEB_VITAL_NAMES.length),
  })
  .strict();

export type WebVitalsPayload = z.infer<typeof webVitalsPayloadSchema>;
