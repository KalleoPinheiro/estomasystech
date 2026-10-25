import { Card } from '@still-void/ui/react';
import Link from 'next/link';
import { LogoutButton } from '@/components/logout-button';
import { PageHeader } from '@/components/page-header';
import { ThemeToggle } from '@/components/theme-toggle';
import { requireStaffPage } from '@/lib/server/session';
import { canRoleAccess } from '@/lib/staff-pages';
import { moreGroupsFor } from '@/lib/staff-shortcuts';

/**
 * "Mais" (#428): o que não cabe na barra inferior do celular, agrupado e já
 * filtrado pelo papel da sessão (mesma matriz de autorização do menu lateral).
 * Server Component (ADR-069): o papel vem da sessão no servidor, então a lista
 * já sai no HTML, sem chamada de API nem salto de layout depois da hidratação.
 */
export default async function MorePage() {
  const { role } = await requireStaffPage({ next: '/mais' });
  const groups = moreGroupsFor(role, (api) => canRoleAccess(api, role));

  return (
    <div>
      <PageHeader title="Mais" />
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.title} aria-labelledby={`mais-${group.title}`}>
            <h2
              id={`mais-${group.title}`}
              className="mb-2 font-semibold text-ink-3 text-sm"
            >
              {group.title}
            </h2>
            <Card>
              <ul className="divide-y divide-border">
                {group.pages.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex min-h-12 items-center px-4 font-medium"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))}
        <section aria-label="Neste aparelho" className="flex flex-col gap-2">
          <ThemeToggle />
          <LogoutButton />
        </section>
      </div>
    </div>
  );
}
