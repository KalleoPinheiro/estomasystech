import type { ReactNode } from 'react';
import type { UserRole } from '@/domain/auth/user-role';
import type { SidebarIdentityDto } from '@/lib/dto';
import { StaffIdentityProvider } from '@/lib/staff-access';

/** Identidade da sessão como `/api/auth/identity` devolve, para o papel dado. */
export const identityFor = (role: UserRole): SidebarIdentityDto => ({
  clinicLabel: 'Clínica Teste',
  account: { email: `${role}@clinica.com`, role, roleLabel: role },
});

/** Envolve a tela no provider do layout da equipe (#199). */
export function WithStaffIdentity({ children }: { children: ReactNode }) {
  return <StaffIdentityProvider>{children}</StaffIdentityProvider>;
}
