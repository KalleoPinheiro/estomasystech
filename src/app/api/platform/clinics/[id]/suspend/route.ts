import type { NextRequest } from 'next/server';
import { SuspendClinic } from '@/application/platform/change-clinic-status';
import { forgetClinicSessionStatus } from '@/lib/auth/staff-revocation';
import { handleClinicStatus } from '../clinic-status-handler';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Suspende a clínica (B5, Journey 7): toda conta dela perde a sessão — neste
 * processo na hora, nos demais em ≤ 60 s (ADR-005) — e não consegue entrar; os
 * lembretes param. Nenhum dado é apagado.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return handleClinicStatus(
    request,
    context,
    'suspend',
    (services, id, actor) => new SuspendClinic(services).execute(id, actor),
    forgetClinicSessionStatus,
  );
}
