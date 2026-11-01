'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { UserRole } from '@/domain/auth/user-role';
import type { SidebarIdentityDto } from '@/lib/dto';
import { canRoleAccess, isOpenToAllStaff } from '@/lib/staff-pages';
import { useApiQuery } from '@/lib/use-api-query';

export {
  canRoleAccess,
  isOpenToAllStaff,
  STAFF_PAGES,
  type StaffPage,
  staffPageFor,
} from '@/lib/staff-pages';

interface StaffIdentityState {
  identity: SidebarIdentityDto | null;
  role: UserRole | null;
  /** Identidade ainda não chegou — telas restritas esperam em vez de piscar 403. */
  loading: boolean;
}

const StaffIdentityContext = createContext<StaffIdentityState | null>(null);

/**
 * Identidade da sessão para todo o layout da equipe. Com `initialIdentity`
 * (lida no servidor pelo layout, ADR-069) não há chamada de API na carga: o
 * papel já está no HTML e nada pisca nem salta depois da hidratação. Sem ela
 * (telas montadas isoladas, falha do servidor), busca `/api/auth/identity`.
 */
export function StaffIdentityProvider({
  children,
  initialIdentity,
}: {
  children: ReactNode;
  initialIdentity?: SidebarIdentityDto;
}) {
  const { data, error } = useApiQuery<SidebarIdentityDto>(
    initialIdentity ? null : '/api/auth/identity',
  );
  const identity = initialIdentity ?? data;
  const value: StaffIdentityState = {
    identity,
    role: (identity?.account?.role as UserRole | undefined) ?? null,
    loading: !identity && !error,
  };
  return (
    <StaffIdentityContext.Provider value={value}>
      {children}
    </StaffIdentityContext.Provider>
  );
}

export function useStaffIdentity(): StaffIdentityState | null {
  return useContext(StaffIdentityContext);
}

/**
 * `can(api)`: a sessão pode usar a rota? Sem provider (tela montada isolada,
 * em teste) ou sem papel conhecido depois de carregar (identidade falhou,
 * conta de sistema), não restringe — a API continua sendo a barreira real.
 * Enquanto a identidade carrega, só libera o que todo papel de equipe usa
 * (evita mostrar e depois esconder).
 */
export function useStaffAccess(): (api: string) => boolean {
  const state = useStaffIdentity();
  return (api: string) => {
    if (state === null) return true;
    if (state.loading) return isOpenToAllStaff(api);
    return state.role === null ? true : canRoleAccess(api, state.role);
  };
}
