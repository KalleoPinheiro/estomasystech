'use client';

import { headerClasses, Skeleton } from '@still-void/ui/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  STAFF_PAGES,
  useStaffAccess,
  useStaffIdentity,
} from '@/lib/staff-access';

/** Itens do menu mais longo (Admin) — o espaço reservado enquanto o papel carrega. */
const LOADING_ITEMS = 14;

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
  const loading = useStaffIdentity()?.loading ?? false;

  // Até saber o papel, reserva o espaço do menu em vez de mostrar 6 itens e
  // depois acrescentar o resto, o que empurrava a barra toda (#482).
  if (loading) {
    return (
      <nav className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: LOADING_ITEMS }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders idênticos e estáticos
          <Skeleton key={i} className="h-6 w-full" aria-hidden="true" />
        ))}
        <span className="sr-only">Carregando menu…</span>
      </nav>
    );
  }

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
