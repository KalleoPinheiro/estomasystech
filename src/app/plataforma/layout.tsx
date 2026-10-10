import { Layout } from '@still-void/ui/react';
import type { Metadata } from 'next';
import { PlatformHeader } from './platform-header';

export const metadata: Metadata = {
  title: 'Plataforma — VittaFlow',
};

/**
 * Área do operador da plataforma (ADR-007): fora do grupo `(staff)`, então sem
 * a sidebar nem a identidade da equipe da clínica. O proxy só deixa o
 * super_admin chegar aqui. O topo leva a navegação da plataforma (C4, #267).
 */
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <PlatformHeader />
      <Layout>
        <main className="flex flex-col gap-4">{children}</main>
      </Layout>
    </div>
  );
}
