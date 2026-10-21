'use client';

import { Badge } from '@still-void/ui/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { TriagePhotoDto } from '@/lib/dto';
import { useStaffAccess, useStaffIdentity } from '@/lib/staff-access';
import { bottomNavFor } from '@/lib/staff-shortcuts';
import { useApiQuery } from '@/lib/use-api-query';

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/** Contador de fotos na fila; só busca quando o atalho de Triagem existe. */
function TriageCount() {
  const { data } = useApiQuery<TriagePhotoDto[]>('/api/photos/triage');
  const count = data?.length ?? 0;
  if (count === 0) return null;
  return (
    <Badge variant="secondary" aria-label={`${count} fotos para avaliar`}>
      {count}
    </Badge>
  );
}

/**
 * Barra de atalhos do celular (#428), fixa no rodapé abaixo de `md`. Atalhos
 * por papel; "Mais" abre a lista do resto. `padding-bottom` com a área segura
 * do iOS/Android (barra de gestos) e alvos de 44px.
 */
export function BottomNav() {
  const pathname = usePathname();
  const can = useStaffAccess();
  const state = useStaffIdentity();
  const items = bottomNavFor(state?.role ?? null).filter(
    (item) => item.api === null || can(item.api),
  );

  return (
    <nav
      aria-label="Atalhos"
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-bg-elev pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs ${
                  active ? 'font-semibold text-accent-ink' : 'text-ink-3'
                }`}
              >
                <span className="truncate">{item.label}</span>
                {item.triageCount && <TriageCount />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
