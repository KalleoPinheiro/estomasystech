'use client';

import { headerClasses } from '@still-void/ui/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { STAFF_PAGES, useStaffAccess } from '@/lib/staff-access';

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/**
 * Navegação do staff com os links do design system (`sv-header__link`, que já
 * garante o alvo mínimo de 24px da WCAG 2.5.8) e estado ativo derivado da rota.
 * Só lista as telas que o papel da sessão pode usar (#199) — Atendente e
 * Profissional não caem mais em telas que respondem 403.
 */
export function StaffNav() {
  const pathname = usePathname();
  const can = useStaffAccess();

  return (
    <nav className="flex flex-col gap-3">
      {STAFF_PAGES.filter((item) => can(item.api)).map((item) => {
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
