import type { NextRequest } from 'next/server';
import { fail, ok } from '@/lib/api-response';
import type { UserRole } from '@/lib/auth/session';
import { logger } from '@/lib/observability/logger';
import { normalizeRoute, roundWidth } from '@/lib/web-vitals';
import { webVitalsPayloadSchema } from '@/lib/web-vitals-schema';

/**
 * Recebimento dos Web Vitals de campo (#559, #643, ADR-086), comum às duas
 * rotas: `/api/me/web-vitals` (equipe) e `/api/portal/web-vitals` (portal). A
 * guarda de sessão fica em cada rota; aqui só entra o corpo. Cada medida vira
 * uma linha `web-vital` com métrica, valor, rating, rota sem id, largura
 * arredondada e papel — nunca conta, empresa, paciente nem responsável. Rota e
 * largura são normalizadas de novo: o corpo é entrada do cliente.
 */
export async function recordWebVitals(
  request: NextRequest,
  role: UserRole,
): Promise<Response> {
  const parsed = webVitalsPayloadSchema.safeParse(
    // Stryker disable next-line ArrowFunction: `null` e `undefined` reprovam igual no esquema (mutante equivalente).
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
      role,
    });
  }
  return ok({ received: metrics.length }, 202);
}
