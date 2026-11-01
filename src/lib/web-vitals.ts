import { z } from 'zod';

/**
 * Web Vitals de campo (#559, ADR-060): o que o navegador mede e o servidor
 * registra no log estruturado. Nada aqui identifica pessoa: a rota perde ids e
 * tokens, a largura da janela é arredondada e o corpo não leva query, hash,
 * cabeçalho nem texto livre. O mesmo normalizador roda no cliente (antes de
 * enviar) e no servidor (que nunca confia no que chegou).
 */

export const WEB_VITAL_NAMES = ['LCP', 'INP', 'CLS', 'TTFB', 'FCP'] as const;
export type WebVitalName = (typeof WEB_VITAL_NAMES)[number];

export const WEB_VITAL_RATINGS = ['good', 'needs-improvement', 'poor'] as const;

/** Segmento que carrega identidade: uuid, número, ou cadeia longa com dígito (token, id opaco). */
const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_SEGMENT = /^\d+$/;
const OPAQUE_SEGMENT = /^(?=.*\d)[A-Za-z0-9_-]{16,}$/;
const HEX_SEGMENT = /^[0-9a-f]{16,}$/i;

const ID_PLACEHOLDER = ':id';
const MAX_ROUTE_LENGTH = 120;
const MAX_SEGMENTS = 8;
const WIDTH_STEP = 50;
const MAX_WIDTH = 10_000;

function isIdentitySegment(segment: string): boolean {
  return (
    UUID_SEGMENT.test(segment) ||
    NUMERIC_SEGMENT.test(segment) ||
    HEX_SEGMENT.test(segment) ||
    OPAQUE_SEGMENT.test(segment)
  );
}

/**
 * Rota sem identidade: `/pacientes/7d3f…/avaliacoes` vira `/pacientes/:id/avaliacoes`.
 * Query e hash saem; segmento que não é só caracteres de URL comuns vira `:id`.
 */
export function normalizeRoute(pathname: string): string {
  const path = pathname.replace(/[?#][\s\S]*$/, '');
  const segments = path.split('/').filter(Boolean).slice(0, MAX_SEGMENTS);
  if (segments.length === 0) return '/';
  const safe = segments.map((segment) =>
    /^[A-Za-z0-9._~-]+$/.test(segment) && !isIdentitySegment(segment)
      ? segment
      : ID_PLACEHOLDER,
  );
  return `/${safe.join('/')}`.slice(0, MAX_ROUTE_LENGTH);
}

/** Largura da janela em passos de 50 px: separa celular, tablet e desktop sem fingerprint. */
export function roundWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.min(MAX_WIDTH, Math.round(width / WIDTH_STEP) * WIDTH_STEP);
}

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
