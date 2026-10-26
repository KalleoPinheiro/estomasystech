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

/**
 * Contador de fotos na fila; só existe quando o atalho de Triagem existe. Com
 * `initial` (contado no servidor, ADR-069) não há chamada de API; sem ele
 * (falha do servidor, tela montada isolada) busca a fila como antes.
 */
function TriageCount({ initial }: { initial?: number }) {
  const { data } = useApiQuery<TriagePhotoDto[]>(
    initial === undefined ? '/api/photos/triage' : null,
  );
  const count = initial ?? data?.length ?? 0;
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
 *
 * `z-20` (degrau `sticky` da escala do Still Void) fica abaixo do fundo (30) e
 * da janela (40): com qualquer modal ou folha aberta a barra fica coberta e
 * inerte (a Radix ainda a marca `aria-hidden`), e um toque fora do lugar não
 * sai do formulário em preenchimento (#523).
 */
export function BottomNav({ triageCount }: { triageCount?: number }) {
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
      className="fixed inset-x-0 bottom-0 z-20 border-border border-t bg-bg-elev pb-[env(safe-area-inset-bottom)] md:hidden"
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
                {item.triageCount && <TriageCount initial={triageCount} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
