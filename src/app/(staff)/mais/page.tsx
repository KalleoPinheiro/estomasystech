'use client';

import { Card } from '@still-void/ui/react';
import Link from 'next/link';
import { LogoutButton } from '@/components/logout-button';
import { PageHeader } from '@/components/page-header';
import { ThemeToggle } from '@/components/theme-toggle';
import { useStaffAccess, useStaffIdentity } from '@/lib/staff-access';
import { moreGroupsFor } from '@/lib/staff-shortcuts';

/**
 * "Mais" (#428): o que não cabe na barra inferior do celular, agrupado e já
 * filtrado pelo papel da sessão (mesma matriz de autorização do menu lateral).
 */
export default function MorePage() {
  const can = useStaffAccess();
  const role = useStaffIdentity()?.role ?? null;
  const groups = moreGroupsFor(role, can);

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
