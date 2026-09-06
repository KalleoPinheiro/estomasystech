'use client';

import { headerClasses } from '@still-void/ui/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/agenda', label: 'Agenda' },
  { href: '/triagem', label: 'Triagem' },
  { href: '/pacientes', label: 'Pacientes' },
  { href: '/parceiros', label: 'Parceiros' },
  { href: '/profissionais', label: 'Profissionais' },
  { href: '/faturamento', label: 'Faturamento' },
  { href: '/procedimentos', label: 'Procedimentos' },
  { href: '/materiais', label: 'Materiais' },
  { href: '/relatorios', label: 'Relatórios' },
  { href: '/auditoria', label: 'Auditoria' },
  { href: '/configuracoes', label: 'Configurações' },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/**
 * Navegação do staff com os links do design system (`sv-header__link`, que já
 * garante o alvo mínimo de 24px da WCAG 2.5.8) e estado ativo derivado da rota.
 */
export function StaffNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-3">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? headerClasses.linkActive : headerClasses.link}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
