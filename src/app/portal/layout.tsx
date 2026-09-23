import {
  Alert,
  AlertDescription,
  Header,
  Icon,
  Layout,
} from '@still-void/ui/react';
import type { Metadata } from 'next';
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
    // `portal-shell` escopa as correções mobile de globals.css (#127) ao portal —
    // telas de staff não usam `.sv-layout` nem mudam de alvo de toque.
    <div className="portal-shell">
      <Header
        logo={
          <div>
            <BrandLogo />
            <p className="text-ink-3 text-xs">
              Portal do paciente e do parceiro
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
              <Icon name="alert-circle" /> Em caso de sangramento, febre ou dor
              intensa, procure atendimento presencial ou um pronto-socorro
              imediatamente — não aguarde resposta pelo portal.
            </AlertDescription>
          </Alert>
          {children}
        </main>
      </Layout>
    </div>
  );
}
