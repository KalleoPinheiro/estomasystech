import type { NextRequest } from 'next/server';
import type {
  ClinicStatusActor,
  ClinicStatusChange,
  ClinicStatusServices,
} from '@/application/platform/change-clinic-status';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { toPlatformClinicDto } from '@/lib/dto';
import { loadPlatformClinic } from './platform-clinic';

type RouteContext = { params: Promise<{ id: string }> };

type StatusAction = 'suspend' | 'reactivate';

type ChangeStatus = (
  services: ClinicStatusServices,
  clinicId: string,
  actor: ClinicStatusActor,
) => Promise<ClinicStatusChange | null>;

/**
 * Suspender/reativar pela plataforma (B5, Journey 7 e 8). A auditoria vai para
 * a clínica-alvo antes da mudança (write-ahead); repetir não grava nada.
 */
export async function handleClinicStatus(
  request: NextRequest,
  context: RouteContext,
  action: StatusAction,
  change: ChangeStatus,
  afterChange: (clinicId: string) => void = () => {},
) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return handleRequest(async () => {
    const { services } = await loadPlatformClinic(id);
    const result = await change(services, id, {
      by: guard.session?.subject ?? 'anonymous',
      at: new Date(),
      audit: () =>
        recordAuditNow(services.auditEvents, guard.session, {
          action: 'update',
          resourceType: 'clinic-status',
          resourceId: id,
          detail: action,
          clinicId: id,
        }),
    });
    if (!result) throw new Error('Clínica não encontrada');
    if (result.changed) afterChange(id);
    return toPlatformClinicDto(result.clinic);
  });
}
