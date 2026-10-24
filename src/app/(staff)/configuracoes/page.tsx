'use client';

import { Card } from '@still-void/ui/react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { useStaffAccess } from '@/lib/staff-access';
import { LegacyAnchorRedirect } from './legacy-anchor-redirect';
import { SETTINGS_SECTIONS } from './sections';

/**
 * Índice de Configurações (#522): cada seção é uma sub-rota própria
 * (`/configuracoes/<slug>`), então a página não cresce com o número de seções
 * e o celular carrega só a que o usuário abriu. Cada papel vê só as seções
 * cujas rotas pode usar (#215): Atendente e Profissional ficam com Identidade
 * e Feriados e ausências. A matriz é a mesma da autorização (`useStaffAccess`);
 * esconder é UX, a API continua barrando.
 */
export default function SettingsPage() {
  const can = useStaffAccess();
  const sections = SETTINGS_SECTIONS.filter(
    (section) => !section.api || can(section.api),
  );
  return (
    <div className="flex flex-col gap-6">
      <LegacyAnchorRedirect />
      <PageHeader title="Configurações" />
      <nav id="indice-secoes" aria-label="Seções da configuração">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <li key={section.slug} className="relative">
              <Card className="h-full p-4 hover:bg-accent-soft">
                <Link
                  href={`/configuracoes/${section.slug}`}
                  className="font-semibold text-ink after:absolute after:inset-0 after:rounded-lg"
                >
                  {section.label}
                </Link>
                <p className="mt-1 text-ink-3 text-sm">{section.summary}</p>
              </Card>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
