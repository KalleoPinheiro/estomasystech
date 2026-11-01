import type { NextRequest } from 'next/server';
import { fail, ok } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { logger } from '@/lib/observability/logger';
import { normalizeRoute, roundWidth } from '@/lib/web-vitals';
import { webVitalsPayloadSchema } from '@/lib/web-vitals-schema';

/**
 * Web Vitals de campo (#559): o navegador da equipe logada (os quatro papéis de
 * equipe, inclusive o operador da plataforma) manda LCP, INP, CLS, TTFB e FCP da página que fechou. Cada medida vira
 * uma linha `web-vital` no log estruturado (ADR-060), só com métrica, valor,
 * rota sem id, largura arredondada e papel — nunca conta, empresa ou paciente.
 * Rota e largura são normalizadas de novo aqui: o corpo é entrada do cliente.
 * Corpo inválido é `400`; sem sessão, `401` (o proxy barra antes); paciente e parceiro, `403`
 * (a guarda de rota exige equipe; o portal fica sem medição de campo por ora, ADR-085).
 */
export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const parsed = webVitalsPayloadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return fail('Medidas inválidas', 400);

  const { route, width, metrics } = parsed.data;
  for (const metric of metrics) {
    logger.info('web-vital', {
      metric: metric.name,
      value: Math.round(metric.value * 1000) / 1000,
      rating: metric.rating ?? null,
      route: normalizeRoute(route),
      width: roundWidth(width),
      role: guard.session.role,
    });
  }
  return ok({ received: metrics.length }, 202);
}
