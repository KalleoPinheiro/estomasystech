import type { NextRequest } from 'next/server';
import { requireStaffSession } from '@/lib/auth/require-session';
import { recordWebVitals } from '@/lib/server/web-vitals-ingest';

/**
 * Web Vitals de campo da equipe (#559, ADR-086): os quatro papéis de equipe,
 * inclusive o operador da plataforma, mandam LCP, INP, CLS, TTFB e FCP da
 * página que fechou. Sem sessão, `401` (o proxy barra antes); paciente,
 * responsável e parceiro, `403`: o portal tem a rota irmã
 * `/api/portal/web-vitals` (#643). O registro está em `recordWebVitals`.
 */
export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  return recordWebVitals(request, guard.session.role);
}
