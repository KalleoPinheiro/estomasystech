'use client';
import { SidebarSection } from '@still-void/ui/react';
import {
  SidebarInset,
  SidebarPanel,
  SidebarProvider,
  SidebarTrigger,
} from '@still-void/ui/react/client';
import { BottomNav } from '@/components/app-shell/bottom-nav';
import { AppVersion } from '@/components/app-version';
import { BrandLogo } from '@/components/brand-logo';
import { IdentityImage } from '@/components/identity-image';
import { LogoutButton } from '@/components/logout-button';
import { ThemeToggle } from '@/components/theme-toggle';
import type { SidebarIdentityDto } from '@/lib/dto';
import { StaffIdentityProvider, useStaffIdentity } from '@/lib/staff-access';
import { useApiQuery } from '@/lib/use-api-query';
import { RoleGate } from './role-gate';
import { SidebarAutoClose } from './sidebar-auto-close';
import { StaffNav } from './staff-nav';

interface StaffLayoutClientProps {
  children: React.ReactNode;
}

/** Clínica ativa + conta logada (issue #126) — nunca texto fixo, sempre a sessão real. Exportado pra teste isolado, sem precisar montar o SidebarProvider inteiro. */
export function SidebarIdentity() {
  const shared = useStaffIdentity();
  const { data: own } = useApiQuery<SidebarIdentityDto>(
    shared ? null : '/api/auth/identity',
  );
  const data = shared ? shared.identity : own;

  return (
    <div className="min-w-0">
      <BrandLogo />
      <div className="mt-2 flex min-w-0 items-center gap-2">
        {data && (
          <IdentityImage
            kind="logo"
            url={data.clinicLogoUrl}
            name={data.clinicLabel}
            size={28}
          />
        )}
        <p className="min-w-0 text-ink-3 text-xs">{data?.clinicLabel ?? ''}</p>
      </div>
      {data?.account && (
        // E-mail inteiro, quebrando linha (#199): truncado ficava "ad…" e
        // ninguém sabia quem estava logado — o objetivo da #126.
        <div className="mt-1 flex min-w-0 items-start gap-2">
          <IdentityImage
            kind="avatar"
            url={data.account.avatarUrl}
            name={data.account.email.split('@')[0].replace(/[._-]+/g, ' ')}
            size={28}
          />
          <p className="min-w-0 text-ink-3 text-xs">
            <span
              className="block break-all"
              title={data.account.email}
              data-sidebar-email
            >
              {data.account.email}
            </span>
            <span className="block">{data.account.roleLabel}</span>
          </p>
        </div>
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
    <StaffIdentityProvider>
      <SidebarProvider defaultOpen={false}>
        <SidebarAutoClose />
        {/* min-w-0: `SidebarProvider` já embrulha isto num `.sv-app-shell` flex
          (ver node_modules/@still-void/ui/dist/style.css) — sem `min-w-0`, este
          div (item flex único dessa linha) herda `min-width: auto` e cresce até
          caber o conteúdo do `<main>`, empurrando a página inteira além do
          viewport em mobile mesmo com a tabela já contida em overflow-x-auto. */}
        <div className="flex min-h-dvh w-full min-w-0 flex-1">
          {/* O <main> não usa o <Layout> do pacote de propósito: `.sv-layout` limita
            a 1120px e as telas do staff são tabelas largas. */}
          <SidebarPanel className="w-56 shrink-0 justify-between border-border border-r p-5">
            <div className="flex flex-col gap-8">
              <SidebarIdentity />
              <SidebarSection title="Navegação">
                <StaffNav />
              </SidebarSection>
            </div>
            <div className="flex flex-col gap-2">
              <ThemeToggle />
              <LogoutButton />
              <AppVersion />
            </div>
          </SidebarPanel>
          <SidebarInset className="min-w-0 flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-6 lg:p-8">
            <div className="mb-4 flex items-center gap-3 lg:hidden">
              {/* min-h-11/min-w-11 (44px): o padding padrão do still-void
                (--sv-space-2 = 8px) rende um alvo de toque de ~38px — abaixo do
                mínimo de acessibilidade para mobile (WCAG 2.5.5 / P1 FASEA-06..09). */}
              <SidebarTrigger className="min-h-11 min-w-11" />
              <BrandLogo />
            </div>
            <RoleGate>{children}</RoleGate>
          </SidebarInset>
          <BottomNav />
        </div>
      </SidebarProvider>
    </StaffIdentityProvider>
  );
}
