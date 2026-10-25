'use client';
import { SidebarSection } from '@still-void/ui/react';
import {
  SidebarInset,
  SidebarPanel,
  SidebarProvider,
  SidebarTrigger,
} from '@still-void/ui/react/client';
import { BottomNav } from '@/components/app-shell/bottom-nav';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/app-shell/skip-link';
import { useStaffDocumentTitle } from '@/components/app-shell/use-staff-document-title';
import { BrandLogo } from '@/components/brand-logo';
import { IdentityImage } from '@/components/identity-image';
import { LogoutButton } from '@/components/logout-button';
import { ReleaseVersion } from '@/components/release-version';
import { ThemeToggle } from '@/components/theme-toggle';
import type { AppVersionDto, SidebarIdentityDto } from '@/lib/dto';
import { StaffIdentityProvider, useStaffIdentity } from '@/lib/staff-access';
import { useApiQuery } from '@/lib/use-api-query';
import { RoleGate } from './role-gate';
import { ScrollFade } from './scroll-fade';
import { SidebarAutoClose } from './sidebar-auto-close';
import { StaffNav } from './staff-nav';

interface StaffLayoutClientProps {
  children: React.ReactNode;
  /** Identidade e versão lidas no servidor pelo layout (ADR-069): a carga não chama `/api`. */
  initialIdentity?: SidebarIdentityDto;
  initialVersion?: AppVersionDto | null;
}

/** Clínica ativa + conta logada (issue #126) — nunca texto fixo, sempre a sessão real. Exportado pra teste isolado, sem precisar montar o SidebarProvider inteiro. */
export function SidebarIdentity() {
  const shared = useStaffIdentity();
  const { data: own } = useApiQuery<SidebarIdentityDto>(
    shared ? null : '/api/auth/identity',
  );
  const data = shared ? shared.identity : own;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <BrandLogo />
      {data && (
        <div className="flex min-w-0 items-center gap-2.5">
          <IdentityImage
            kind="logo"
            url={data.clinicLogoUrl}
            name={data.clinicLabel}
            size={32}
          />
          <p
            className="min-w-0 truncate font-semibold text-ink-2 text-sm"
            title={data.clinicLabel}
          >
            {data.clinicLabel}
          </p>
        </div>
      )}
      {data?.account && (
        // Uma linha com reticências: o e-mail inteiro fica no `title` (passar o
        // mouse) e a lista de contas mostra o endereço completo (#199).
        <div className="flex min-w-0 items-center gap-2.5">
          <IdentityImage
            kind="avatar"
            url={data.account.avatarUrl}
            name={data.account.email.split('@')[0].replace(/[._-]+/g, ' ')}
            size={32}
          />
          <p className="flex min-w-0 flex-col text-ink-2 text-xs">
            <span
              className="block truncate"
              title={data.account.email}
              data-sidebar-email
            >
              {data.account.email}
            </span>
            <span className="block truncate">{data.account.roleLabel}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export function StaffLayoutClient({
  children,
  initialIdentity,
  initialVersion,
}: StaffLayoutClientProps) {
  useStaffDocumentTitle();
  return (
    // defaultOpen=false: o default da lib é `true` (pensado pro rail de
    // desktop, que fica visível independente de `open`) — sem essa prop,
    // `open` nasce true e o drawer mobile (que É gated por `open`) abre
    // sozinho assim que a hidratação detecta viewport mobile, sem clique
    // nenhum do usuário. Não afeta o desktop: o rail em modo "offcanvas"
    // renderiza incondicionalmente, sem olhar pra `open`.
    <StaffIdentityProvider initialIdentity={initialIdentity}>
      <SidebarProvider defaultOpen={false}>
        <SkipLink />
        <SidebarAutoClose />
        {/* min-w-0: `SidebarProvider` já embrulha isto num `.sv-app-shell` flex
          (ver node_modules/@still-void/ui/dist/style.css) — sem `min-w-0`, este
          div (item flex único dessa linha) herda `min-width: auto` e cresce até
          caber o conteúdo do `<main>`, empurrando a página inteira além do
          viewport em mobile mesmo com a tabela já contida em overflow-x-auto. */}
        <div className="flex min-h-dvh w-full min-w-0 flex-1">
          {/* O <main> não usa o <Layout> do pacote de propósito: `.sv-layout` limita
            a 1120px e as telas do staff são tabelas largas. */}
          {/* Colado ao topo e com a altura da janela menos a faixa de homologação (#482):
              Tema e Sair ficam sempre à vista, inclusive em janela baixa. */}
          <SidebarPanel className="flex max-h-[calc(100dvh-var(--staging-banner-h,0px))] flex-col [&>.sv-app-sidebar__body]:max-h-full [&>.sv-app-sidebar__body]:min-h-0 [&>.sv-app-sidebar__body]:flex-1 [&>.sv-app-sidebar__body]:justify-between w-56 shrink-0 justify-between border-border border-r px-3 py-5 lg:sticky lg:top-0 lg:h-[calc(100dvh-var(--staging-banner-h,0px))] lg:self-start">
            {/* px-3 (e não p-5): a marca «EstomaSysTech» mede ~144 px e o miolo útil do menu
                (painel − padding − padding do corpo) ficava em 135 px, cortando-a (#535). A
                largura w-56 fica, para não estreitar o conteúdo da página. */}
            {/* Só o menu rola em tela baixa; Tema, Sair e versão ficam sempre à vista (#482). */}
            {/* overflow-x-hidden: com overflow-y o x vira auto e aparecia barra horizontal
                sob «Minha conta»; -mx-1/px-1 preservam o anel de foco dos links. */}
            <ScrollFade className="-mx-1 flex min-h-0 flex-col gap-8 overflow-y-auto overflow-x-hidden px-1">
              <SidebarIdentity />
              <SidebarSection title="Navegação">
                <StaffNav />
              </SidebarSection>
            </ScrollFade>
            <div className="flex shrink-0 flex-col gap-2 pt-4">
              <ThemeToggle />
              <LogoutButton />
              <ReleaseVersion initial={initialVersion} />
            </div>
          </SidebarPanel>
          {/* overflow-y-visible/overflow-x-clip: o pacote põe `overflow: auto` no inset, que
              vira o contêiner de rolagem do `position: sticky` — mas a página rola na janela,
              então o índice de Configurações não grudava no celular (#534). `clip` não cria
              contêiner de rolagem e ainda contém o excesso horizontal. */}
          <SidebarInset
            id={MAIN_CONTENT_ID}
            tabIndex={-1}
            className="min-w-0 overflow-y-visible overflow-x-clip outline-none flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-6 lg:p-8"
          >
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
