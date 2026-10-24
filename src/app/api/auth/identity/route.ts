import type { NextRequest } from 'next/server';
import {
  type ClinicTheme,
  DEFAULT_CLINIC_THEME,
} from '@/domain/clinic/clinic-identity';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest, ok } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { staffRoleLabel } from '@/lib/auth/role-labels';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  accountAvatarUrl,
  clinicLogoUrl,
  type SidebarIdentityDto,
} from '@/lib/dto';

const isDefaultTheme = (theme: ClinicTheme) =>
  theme.mode === DEFAULT_CLINIC_THEME.mode &&
  theme.accent === DEFAULT_CLINIC_THEME.accent;

const SYSTEM_ACCOUNT_LABEL = 'Conta de sistema';

/** Identidade da sessão ativa pra sidebar (issue #126) — clínica real + conta logada, nunca texto fixo. */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const session = guard.session;

  const account = {
    email: session.subject,
    role: session.role,
    roleLabel: staffRoleLabel(session.role),
    professionalId: session.professionalId,
  };

  if (session.clinicId === null) {
    return ok<SidebarIdentityDto>({
      clinicLabel: SYSTEM_ACCOUNT_LABEL,
      account,
    });
  }

  return handleRequest(async () => {
    const { clinics, userAccounts } = await getRepositories(
      sessionScope(session),
    );
    const clinic = await clinics.findById(session.clinicId as string);
    const own = await userAccounts.findByEmail(session.subject);
    const logoUrl = clinicLogoUrl(clinic?.logoKey ?? null);
    const avatarUrl = own ? accountAvatarUrl(own.id, own.avatarKey) : null;
    // Chaves só aparecem quando há imagem: a resposta sem imagem não muda.
    return {
      clinicLabel: clinic ? clinic.name : 'Clínica não encontrada',
      ...(logoUrl ? { clinicLogoUrl: logoUrl } : {}),
      ...(clinic && !isDefaultTheme(clinic.theme)
        ? { clinicTheme: clinic.theme }
        : {}),
      account: { ...account, ...(avatarUrl ? { avatarUrl } : {}) },
    } satisfies SidebarIdentityDto;
  });
}
