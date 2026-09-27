import type { NextRequest } from 'next/server';
import { ReactivateClinic } from '@/application/platform/change-clinic-status';
import { handleClinicStatus } from '../clinic-status-handler';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Reativa a clínica (B5, Journey 8): as contas voltam a entrar com novo login
 * e os lembretes voltam no próximo disparo.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  return handleClinicStatus(
    request,
    context,
    'reactivate',
    (services, id, actor) =>
      new ReactivateClinic(services.clinics).execute(id, actor),
  );
}
