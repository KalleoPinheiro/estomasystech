import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest, ok } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { staffRoleLabel } from '@/lib/auth/role-labels';
import { sessionScope } from '@/lib/auth/tenant-scope';
import type { SidebarIdentityDto } from '@/lib/dto';

const SYSTEM_ACCOUNT_LABEL = 'Conta de sistema';

/** Identidade da sessão ativa pra sidebar (issue #126) — clínica real + conta logada, nunca texto fixo. */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const session = guard.session;
  if (!session) {
    return ok<SidebarIdentityDto>({
      clinicLabel: SYSTEM_ACCOUNT_LABEL,
      account: null,
    });
  }

  const account = {
    email: session.subject,
    role: session.role,
    roleLabel: staffRoleLabel(session.role),
  };

  if (session.clinicId === null) {
    return ok<SidebarIdentityDto>({
      clinicLabel: SYSTEM_ACCOUNT_LABEL,
      account,
    });
  }

  return handleRequest(async () => {
    const { clinics } = await getRepositories(sessionScope(session));
    const clinic = await clinics.findById(session.clinicId as string);
    return {
      clinicLabel: clinic ? clinic.name : 'Clínica não encontrada',
      account,
    } satisfies SidebarIdentityDto;
  });
}
