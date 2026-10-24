import type { UserRole } from '@/domain/auth/user-role';
import { STAFF_PAGES, type StaffPage } from '@/lib/staff-access';

/**
 * Atalhos da barra inferior do celular (#428). O iOS limita a 5 itens, então o
 * que não cabe vai para "Mais" (`/mais`). Cada atalho aponta para uma tela de
 * `STAFF_PAGES`: a permissão continua vindo da matriz de autorização.
 */
export const MORE_HREF = '/mais';

export interface BottomNavItem {
  href: string;
  label: string;
  /** Rota de API de que a tela depende; `null` no "Mais", que todo papel abre. */
  api: string | null;
  /** O atalho exibe o contador de fotos aguardando triagem. */
  triageCount?: true;
}

const page = (href: StaffPage['href'], label?: string): BottomNavItem => {
  const found = STAFF_PAGES.find((p) => p.href === href) as StaffPage;
  return { href, label: label ?? found.label, api: found.api };
};

const HOJE = page('/');
const AGENDA = page('/agenda');
const PACIENTES = page('/pacientes');
const FATURAS = page('/faturamento', 'Faturas');
const TRIAGEM: BottomNavItem = { ...page('/triagem'), triageCount: true };
const MAIS: BottomNavItem = { href: MORE_HREF, label: 'Mais', api: null };

const BOTTOM_NAV_BY_ROLE: Partial<Record<UserRole, readonly BottomNavItem[]>> =
  {
    company_admin: [HOJE, AGENDA, PACIENTES, FATURAS, MAIS],
    atendente: [HOJE, AGENDA, PACIENTES, MAIS],
    profissional: [HOJE, AGENDA, TRIAGEM, PACIENTES, MAIS],
  };

/** Papel ainda desconhecido (identidade carregando ou conta de sistema). */
const DEFAULT_BOTTOM_NAV: readonly BottomNavItem[] = [
  HOJE,
  AGENDA,
  PACIENTES,
  MAIS,
];

export function bottomNavFor(role: UserRole | null): readonly BottomNavItem[] {
  return (role && BOTTOM_NAV_BY_ROLE[role]) || DEFAULT_BOTTOM_NAV;
}

export interface MoreGroup {
  title: string;
  pages: readonly StaffPage[];
}

const MORE_LAYOUT: readonly { title: string; hrefs: readonly string[] }[] = [
  {
    title: 'Atendimento',
    hrefs: [
      '/triagem',
      '/parceiros',
      '/profissionais',
      '/procedimentos',
      '/materiais',
    ],
  },
  {
    title: 'Gestão',
    hrefs: [
      '/faturamento',
      '/relatorios',
      '/repasses',
      '/auditoria',
      '/pedidos-titular',
    ],
  },
  { title: 'Conta', hrefs: ['/configuracoes', '/minha-conta'] },
];

/**
 * Grupos da tela "Mais": tudo que o papel pode abrir e que não está na barra
 * inferior dele. Grupo sem item some.
 */
export function moreGroupsFor(
  role: UserRole | null,
  can: (api: string) => boolean,
): MoreGroup[] {
  const inBar = new Set(bottomNavFor(role).map((item) => item.href));
  return MORE_LAYOUT.map(({ title, hrefs }) => ({
    title,
    pages: STAFF_PAGES.filter(
      (p) => hrefs.includes(p.href) && !inBar.has(p.href) && can(p.api),
    ),
  })).filter((group) => group.pages.length > 0);
}
