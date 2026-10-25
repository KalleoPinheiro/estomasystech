import { loadStaffShell } from '@/lib/server/data/staff-shell';
import { staffMetadata } from '@/lib/staff-metadata';
import { StaffLayoutClient } from './staff-layout-client';

// Título padrão do grupo é o da tela inicial; cada segmento troca o seu no próprio layout.
export const metadata = staffMetadata('Hoje');

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Identidade e versão vêm no HTML (ADR-069): o casco não chama `/api` na carga.
  const { identity, version } = await loadStaffShell();
  return (
    <StaffLayoutClient initialIdentity={identity} initialVersion={version}>
      {children}
    </StaffLayoutClient>
  );
}
