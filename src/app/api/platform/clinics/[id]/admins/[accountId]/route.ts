import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  ADMIN_ACTIONS,
  ManageClinicAdmins,
} from '@/application/platform/manage-clinic-admins';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { forgetSessionStatus } from '@/lib/auth/staff-revocation';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { toClinicAdminDto } from '@/lib/dto';

type RouteContext = { params: Promise<{ id: string; accountId: string }> };

const bodySchema = z.object({ action: z.enum(ADMIN_ACTIONS) });

/**
 * Reenviar convite, desativar e reativar um Admin de Empresa pela plataforma
 * (B4, Journey 4 e 5). Só conta `company_admin` da clínica é alvo; o resto é
 * `404`. Cada ação grava auditoria na clínica-alvo antes de mudar a conta.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id: clinicId, accountId } = await context.params;
  const services = await getRepositories(clinicScope(clinicId));
  if (!(await services.clinics.findById(clinicId))) {
    return fail('Clínica não encontrada', 404);
  }
  const admins = new ManageClinicAdmins(services);
  const account = await admins.find(accountId);
  if (!account) return fail('Admin não encontrado', 404);

  return handleRequest(async () => {
    const { action } = bodySchema.parse(await request.json());
    const { account: updated, delivered } = await admins.apply(
      account,
      action,
      () =>
        recordAuditNow(services.auditEvents, guard.session, {
          action: 'update',
          resourceType: 'account',
          resourceId: account.id,
          detail: action,
          clinicId,
        }),
    );
    if (action === 'deactivate') {
      forgetSessionStatus(updated.email, updated.clinicId);
    }
    return { ...toClinicAdminDto(updated), delivered };
  });
}
