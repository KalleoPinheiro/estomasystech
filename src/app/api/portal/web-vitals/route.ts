import type { NextRequest } from 'next/server';
import { requirePortalSession } from '@/lib/auth/require-session';
import { recordWebVitals } from '@/lib/server/web-vitals-ingest';

/**
 * Web Vitals de campo do portal (#643, errata da ADR-086): paciente,
 * responsável e parceiro mandam as medidas da página que fechou, no mesmo
 * formato e com a mesma normalização de `/api/me/web-vitals`. Sem sessão,
 * `401`; sem `AUTH_SECRET`, `503`; equipe da clínica, `403` (tem a rota
 * própria). O log leva só o papel: nunca o paciente, o responsável ou o
 * paciente representado.
 */
export async function POST(request: NextRequest) {
  const guard = requirePortalSession(request, [
    'patient',
    'guardian',
    'partner',
  ]);
  if (!guard.ok) return guard.response;
  return recordWebVitals(request, guard.session.role);
}
