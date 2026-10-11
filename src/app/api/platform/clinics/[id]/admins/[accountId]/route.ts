import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  ADMIN_ACTIONS,
  ManageClinicAdmins,
} from '@/application/platform/manage-clinic-admins';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { forgetSessionStatus } from '@/lib/auth/staff-revocation';
import { toClinicAdminDto } from '@/lib/dto';
import {
  loadPlatformClinic,
  PlatformNotFoundError,
} from '../../platform-clinic';

type RouteContext = { params: Promise<{ id: string; accountId: string }> };

const bodySchema = z.object({ action: z.enum(ADMIN_ACTIONS) });

/**
 * Reenviar convite, gerar link de redefinição (C2, #265), desativar e reativar
 * um Admin de Empresa pela plataforma (B4, Journey 4 e 5). Só conta `company_admin` da clínica é alvo; o resto é
 * `404`. Cada ação grava auditoria na clínica-alvo antes de mudar a conta.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id: clinicId, accountId } = await context.params;
  return handleRequest(async () => {
    const { services, clinic } = await loadPlatformClinic(clinicId);
    const admins = new ManageClinicAdmins(services);
    const account = await admins.find(accountId);
    if (!account) throw new PlatformNotFoundError('Admin não encontrado');
    const { action } = bodySchema.parse(await request.json());
    const {
      account: updated,
      delivered,
      inviteUrl,
    } = await admins.apply(clinic, account, action, (auditEvents) =>
      recordAuditNow(auditEvents, guard.session, {
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
    return { ...toClinicAdminDto(updated), delivered, inviteUrl };
  });
}
