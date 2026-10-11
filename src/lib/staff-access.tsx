'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { UserRole } from '@/domain/auth/user-role';
import { classifyRoute, isFamilyAllowedForRole } from '@/lib/auth/route-family';
import { CLINIC_STAFF_ROLES } from '@/lib/auth/staff-roles';
import type { SidebarIdentityDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';

/**
 * Telas da equipe e a rota de API de que cada uma depende (#199). A decisão de
 * mostrar ou esconder vem da MESMA matriz da autorização
 * (`src/lib/auth/route-family.ts`) aplicada a essa rota — nenhuma regra de
 * papel duplicada aqui. Esconder é só UX (ADR-003): a API continua barrando.
 */
export const STAFF_PAGES = [
  { href: '/', label: 'Dashboard', api: '/api/appointments' },
  { href: '/agenda', label: 'Agenda', api: '/api/appointments' },
  { href: '/triagem', label: 'Triagem', api: '/api/photos/triage' },
  { href: '/pacientes', label: 'Pacientes', api: '/api/patients' },
  { href: '/parceiros', label: 'Parceiros', api: '/api/partners' },
  { href: '/profissionais', label: 'Profissionais', api: '/api/professionals' },
  { href: '/faturamento', label: 'Faturamento', api: '/api/invoices' },
  { href: '/procedimentos', label: 'Procedimentos', api: '/api/procedures' },
  { href: '/materiais', label: 'Materiais', api: '/api/supplies' },
  { href: '/relatorios', label: 'Relatórios', api: '/api/reports' },
  { href: '/repasses', label: 'Repasses', api: '/api/my-payouts' },
  { href: '/auditoria', label: 'Auditoria', api: '/api/audit' },
  // Toda a equipe entra: feriados e ausências são de todos os papéis; cada
  // seção da tela se esconde quando o papel não usa a rota dela (#215).
  {
    href: '/pedidos-titular',
    label: 'Pedidos do titular',
    api: '/api/data-requests',
  },
  {
    href: '/configuracoes',
    label: 'Configurações',
    api: '/api/settings/schedule/closures',
  },
] as const;

export type StaffPage = (typeof STAFF_PAGES)[number];

export function canRoleAccess(api: string, role: UserRole): boolean {
  return isFamilyAllowedForRole(classifyRoute(api), role);
}

/** Rota que qualquer papel da clínica usa — não precisa esperar a identidade. */
export function isOpenToAllStaff(api: string): boolean {
  return CLINIC_STAFF_ROLES.every((role) => canRoleAccess(api, role));
}

/** Tela da equipe a que o caminho pertence (prefixo mais longo; `/` só exato). */
export function staffPageFor(pathname: string): StaffPage | undefined {
  return STAFF_PAGES.filter((page) =>
    page.href === '/'
      ? pathname === '/'
      : pathname === page.href || pathname.startsWith(`${page.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0];
}

interface StaffIdentityState {
  identity: SidebarIdentityDto | null;
  role: UserRole | null;
  /** Identidade ainda não chegou — telas restritas esperam em vez de piscar 403. */
  loading: boolean;
}

const StaffIdentityContext = createContext<StaffIdentityState | null>(null);

/** Busca a identidade da sessão uma vez para todo o layout da equipe. */
export function StaffIdentityProvider({ children }: { children: ReactNode }) {
  const { data, error } = useApiQuery<SidebarIdentityDto>('/api/auth/identity');
  const value: StaffIdentityState = {
    identity: data,
    role: (data?.account?.role as UserRole | undefined) ?? null,
    loading: !data && !error,
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
