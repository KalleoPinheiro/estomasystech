import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ManageClinicAdmins } from '@/application/platform/manage-clinic-admins';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { toUserAccountDto } from '@/lib/dto';
import { listPlatformClinicAdmins } from '@/lib/server/data/platform';
import { loadPlatformClinic, PlatformNotFoundError } from '../platform-clinic';

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  email: z.string().min(3).max(200),
});

/** Admins de Empresa da clínica (B4): só `company_admin`, nada da equipe. */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id: clinicId } = await context.params;
  return handleRequest(async () => {
    const admins = await listPlatformClinicAdmins(clinicId);
    if (!admins) throw new PlatformNotFoundError('Clínica não encontrada');
    return admins;
  });
}

/**
 * Convite de um Admin de Empresa da clínica (B1, ADR-007; B4 exige o cadastro
 * completo antes). A conta nasce sem senha usável e a pessoa define a própria
 * senha pelo convite. Quando o e-mail não sai (clínica sem canal, ADR-011), o
 * link volta para o operador repassar — decisão do dono, 2026-10-10; com o
 * e-mail entregue, `inviteUrl` é `null`.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const { id: clinicId } = await context.params;
  return handleRequest(async () => {
    const { services, clinic } = await loadPlatformClinic(clinicId);
    const body = bodySchema.parse(await request.json());
    const { account, delivered, inviteUrl } = await new ManageClinicAdmins(
      services,
    ).invite(clinic, body.email, (auditEvents, createdAccount) =>
      recordAuditNow(auditEvents, guard.session, {
        action: 'create',
        resourceType: 'account',
        resourceId: createdAccount.id,
        clinicId,
      }),
    );
    return {
      ...toUserAccountDto(account),
      role: account.role,
      clinicId: account.clinicId,
      delivered,
      inviteUrl,
    };
  });
}
