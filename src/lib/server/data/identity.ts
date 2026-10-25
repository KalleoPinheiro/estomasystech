import 'server-only';
import { cache } from 'react';
import {
  type ClinicTheme,
  DEFAULT_CLINIC_THEME,
} from '@/domain/clinic/clinic-identity';
import { getRepositories } from '@/infrastructure/container';
import { staffRoleLabel } from '@/lib/auth/role-labels';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  accountAvatarUrl,
  clinicLogoUrl,
  type SidebarIdentityDto,
} from '@/lib/dto';
import { requireStaffPage } from '@/lib/server/session';

const isDefaultTheme = (theme: ClinicTheme) =>
  theme.mode === DEFAULT_CLINIC_THEME.mode &&
  theme.accent === DEFAULT_CLINIC_THEME.accent;

export const SYSTEM_ACCOUNT_LABEL = 'Conta de sistema';

/**
 * Identidade da sessão ativa (clínica real + conta logada, issue #126). Lê só
 * a empresa da própria sessão (`sessionScope`, regra 1) e devolve o DTO — a
 * mesma resposta de `GET /api/auth/identity`, que reaproveita esta função.
 */
export async function buildSidebarIdentity(
  session: Session,
): Promise<SidebarIdentityDto> {
  const account = {
    email: session.subject,
    role: session.role,
    roleLabel: staffRoleLabel(session.role),
    professionalId: session.professionalId,
  };

  if (session.clinicId === null) {
    return { clinicLabel: SYSTEM_ACCOUNT_LABEL, account };
  }

  const { clinics, userAccounts } = await getRepositories(
    sessionScope(session),
  );
  const clinic = await clinics.findById(session.clinicId);
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
}

/**
 * Identidade da equipe para o layout e as páginas: exige a sessão da equipe e
 * é deduplicada por requisição (`React.cache`, ADR-069 § 3).
 */
export const getStaffIdentity = cache(
  async (): Promise<SidebarIdentityDto> =>
    buildSidebarIdentity(await requireStaffPage()),
);
