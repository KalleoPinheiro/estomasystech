import type { NextRequest } from 'next/server';
import type {
  ClinicStatusActor,
  ClinicStatusChange,
  ClinicStatusServices,
} from '@/application/platform/change-clinic-status';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { toPlatformClinicDto } from '@/lib/dto';

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
  const services = await getRepositories(clinicScope(id));
  if (!(await services.clinics.findById(id))) {
    return fail('Clínica não encontrada', 404);
  }

  return handleRequest(async () => {
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
