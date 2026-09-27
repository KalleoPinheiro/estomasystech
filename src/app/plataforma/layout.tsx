import { Header, Layout } from '@still-void/ui/react';
import type { Metadata } from 'next';
import { BrandLogo } from '@/components/brand-logo';
import { LogoutButton } from '@/components/logout-button';

export const metadata: Metadata = {
  title: 'Plataforma — VittaFlow',
};

/**
 * Área do operador da plataforma (ADR-007): fora do grupo `(staff)`, então sem
 * a sidebar nem a identidade da equipe da clínica. O proxy só deixa o
 * super_admin chegar aqui.
 */
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <Header logo={<BrandLogo />} actions={<LogoutButton />} />
      <Layout>
        <main className="flex flex-col gap-4">{children}</main>
      </Layout>
    </div>
  );
}
