import { Alert, AlertDescription, Header, Layout } from '@still-void/ui/react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { LogoutButton } from '@/components/logout-button';

export const metadata: Metadata = {
  title: 'Portal — VittaFlow',
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `portal-shell` escopa ao portal a regra de toque de links de globals.css
    // (#127) — o header do portal fica fora do `main` das telas da equipe.
    <div className="portal-shell">
      <Header
        logo={
          <div>
            <BrandLogo />
            <p className="text-ink-3 text-xs">
              Portal do paciente, do responsável e do parceiro
            </p>
          </div>
        }
        actions={<LogoutButton />}
      />
      {/* `.sv-layout` centraliza em 1120px; o portal lê melhor mais estreito e o
          utilitário vence porque o CSS do pacote entra em layer(components). */}
      <Layout className="max-w-3xl">
        <main className="flex flex-col gap-4">
          {/* PORT-05: orientação de urgência fixa, visível em toda a superfície
              do portal — sem telefone/WhatsApp dinâmico porque `ClinicInfoDto`
              não tem esse campo hoje (ver Assumptions do spec). */}
          <Alert variant="warning">
            <AlertDescription>
              Em caso de sangramento, febre ou dor intensa, procure atendimento
              presencial ou um pronto-socorro imediatamente — não aguarde
              resposta pelo portal.
            </AlertDescription>
          </Alert>
          {children}
          <p className="text-center text-sm">
            <Link
              href="/privacidade"
              className="text-accent-ink hover:underline"
            >
              Aviso de privacidade
            </Link>
          </p>
        </main>
      </Layout>
    </div>
  );
}
