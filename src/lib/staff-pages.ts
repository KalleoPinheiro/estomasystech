import type { UserRole } from '@/domain/auth/user-role';
import { classifyRoute, isFamilyAllowedForRole } from '@/lib/auth/route-family';
import { CLINIC_STAFF_ROLES } from '@/lib/auth/staff-roles';

/**
 * Telas da equipe e a rota de API de que cada uma depende (#199). A decisão de
 * mostrar ou esconder vem da MESMA matriz da autorização
 * (`src/lib/auth/route-family.ts`) aplicada a essa rota — nenhuma regra de
 * papel duplicada aqui. Esconder é só UX (ADR-003): a API continua barrando.
 */
export const STAFF_PAGES = [
  { href: '/', label: 'Hoje', api: '/api/appointments' },
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
  // Toda a equipe cuida da própria senha e do segundo fator (#295).
  { href: '/minha-conta', label: 'Minha conta', api: '/api/me' },
] as const;

export type StaffPage = (typeof STAFF_PAGES)[number];

export function canRoleAccess(api: string, role: UserRole): boolean {
  return isFamilyAllowedForRole(classifyRoute(api), role);
}

/** Rota que qualquer papel da clínica usa — não precisa esperar a identidade. */
export function isOpenToAllStaff(api: string): boolean {
  return CLINIC_STAFF_ROLES.every((role) => canRoleAccess(api, role));
}

/**
 * Tela da equipe a que o caminho pertence (`/` só exato). Os `href` não são
 * prefixo uns dos outros, então no máximo uma tela casa.
 */
export function staffPageFor(pathname: string): StaffPage | undefined {
  return STAFF_PAGES.find((page) =>
    page.href === '/'
      ? pathname === '/'
      : pathname === page.href || pathname.startsWith(`${page.href}/`),
  );
}

/**
 * Papéis da clínica que a matriz de autorização deixa usar a rota `api`. A
 * Server Action de uma tela recebe esta lista em `roles`, então ação e API
 * respondem igual para o mesmo papel, sem regra duplicada.
 */
export function rolesWithAccessTo(api: string): readonly UserRole[] {
  return CLINIC_STAFF_ROLES.filter((role) => canRoleAccess(api, role));
}
