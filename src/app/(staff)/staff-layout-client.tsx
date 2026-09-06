'use client';
import { SidebarSection } from '@still-void/ui/react';
import {
  SidebarInset,
  SidebarPanel,
  SidebarProvider,
  SidebarTrigger,
} from '@still-void/ui/react/client';
import { BrandLogo } from '@/components/brand-logo';
import { LogoutButton } from '@/components/logout-button';
import type { SidebarIdentityDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';
import { SidebarAutoClose } from './sidebar-auto-close';
import { StaffNav } from './staff-nav';

interface StaffLayoutClientProps {
  children: React.ReactNode;
}

/** Clínica ativa + conta logada (issue #126) — nunca texto fixo, sempre a sessão real. Exportado pra teste isolado, sem precisar montar o SidebarProvider inteiro. */
export function SidebarIdentity() {
  const { data } = useApiQuery<SidebarIdentityDto>('/api/auth/identity');

  return (
    <div>
      <BrandLogo />
      <p className="mt-1 text-ink-3 text-xs">{data?.clinicLabel ?? ''}</p>
      {data?.account && (
        <p className="mt-0.5 text-ink-3 text-xs">
          {data.account.email} · {data.account.roleLabel}
        </p>
      )}
    </div>
  );
}

export function StaffLayoutClient({ children }: StaffLayoutClientProps) {
  return (
    // defaultOpen=false: o default da lib é `true` (pensado pro rail de
    // desktop, que fica visível independente de `open`) — sem essa prop,
    // `open` nasce true e o drawer mobile (que É gated por `open`) abre
    // sozinho assim que a hidratação detecta viewport mobile, sem clique
    // nenhum do usuário. Não afeta o desktop: o rail em modo "offcanvas"
    // renderiza incondicionalmente, sem olhar pra `open`.
    <SidebarProvider defaultOpen={false}>
      <SidebarAutoClose />
      {/* min-w-0: `SidebarProvider` já embrulha isto num `.sv-app-shell` flex
          (ver node_modules/@still-void/ui/dist/style.css) — sem `min-w-0`, este
          div (item flex único dessa linha) herda `min-width: auto` e cresce até
          caber o conteúdo do `<main>`, empurrando a página inteira além do
          viewport em mobile mesmo com a tabela já contida em overflow-x-auto. */}
      <div className="flex min-h-screen min-w-0">
        {/* O <main> não usa o <Layout> do pacote de propósito: `.sv-layout` limita
            a 1120px e as telas do staff são tabelas largas. */}
        <SidebarPanel className="w-56 shrink-0 justify-between border-border border-r p-5">
          <div className="flex flex-col gap-8">
            <SidebarIdentity />
            <SidebarSection title="Navegação">
              <StaffNav />
            </SidebarSection>
          </div>
          <LogoutButton />
        </SidebarPanel>
        <SidebarInset className="min-w-0 flex-1 p-6 lg:p-8">
          <div className="mb-4 flex items-center gap-3 lg:hidden">
            {/* min-h-11/min-w-11 (44px): o padding padrão do still-void
                (--sv-space-2 = 8px) rende um alvo de toque de ~38px — abaixo do
                mínimo de acessibilidade para mobile (WCAG 2.5.5 / P1 FASEA-06..09). */}
            <SidebarTrigger className="min-h-11 min-w-11" />
            <BrandLogo />
          </div>
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
