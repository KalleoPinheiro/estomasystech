'use client';

import { Card } from '@still-void/ui/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LoadingIndicator } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { useStaffAccess, useStaffIdentity } from '@/lib/staff-access';
import { SETTINGS_SECTIONS, type SettingsSectionSlug } from './sections';

/**
 * Moldura de uma sub-rota de Configurações (#522): «Voltar ao índice» no topo
 * (mobile first — o celular não rola até o fim para voltar) e o mesmo corte por
 * papel do índice. Esconder é UX; a API continua barrando (ADR-002).
 */
export function SettingsSectionPage({
  slug,
  children,
}: {
  slug: SettingsSectionSlug;
  children: ReactNode;
}) {
  const can = useStaffAccess();
  const state = useStaffIdentity();
  const section = SETTINGS_SECTIONS.find((item) => item.slug === slug);
  const allowed = !section?.api || can(section.api);

  if (!allowed && state?.loading) return <LoadingIndicator />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações"
        description={section?.label}
        leading={
          <Link
            href="/configuracoes"
            className="inline-flex font-medium text-accent-ink text-sm hover:underline"
          >
            Voltar ao índice
          </Link>
        }
      />
      {allowed ? (
        <div className="flex min-w-0 flex-col gap-8">{children}</div>
      ) : (
        <Card className="p-5" data-role-denied>
          <p className="font-medium">Seu papel não tem acesso a esta seção.</p>
          <p className="mt-1 text-ink-3 text-sm">
            Se precisar dela, fale com o administrador da clínica.
          </p>
        </Card>
      )}
    </div>
  );
}
