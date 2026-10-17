'use client';

import { Header } from '@still-void/ui/react';
import { usePathname } from 'next/navigation';
import { BrandLogo } from '@/components/brand-logo';
import { LogoutButton } from '@/components/logout-button';

/**
 * Seções da plataforma (C4, #267). `match` decide qual link fica marcado: o
 * detalhe e o cadastro de clínica pertencem à seção Clínicas.
 */
const PLATFORM_SECTIONS = [
  {
    label: 'Clínicas',
    href: '/plataforma',
    match: (path: string) =>
      path === '/plataforma' || path.startsWith('/plataforma/clinicas'),
  },
  {
    label: 'Auditoria',
    href: '/plataforma/auditoria',
    match: (path: string) => path.startsWith('/plataforma/auditoria'),
  },
  {
    label: 'Taxonomia',
    href: '/plataforma/taxonomia',
    match: (path: string) => path.startsWith('/plataforma/taxonomia'),
  },
  {
    label: 'Minha conta',
    href: '/plataforma/minha-conta',
    match: (path: string) => path.startsWith('/plataforma/minha-conta'),
  },
];

/** Topo da área do operador: marca, navegação fixa e Sair. */
export function PlatformHeader() {
  const pathname = usePathname() ?? '';
  const items = PLATFORM_SECTIONS.map(({ label, href, match }) => ({
    label,
    href,
    active: match(pathname),
  }));
  return (
    <Header logo={<BrandLogo />} items={items} actions={<LogoutButton />} />
  );
}
