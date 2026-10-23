import { staffMetadata } from '@/lib/staff-metadata';
import { StaffLayoutClient } from './staff-layout-client';

// Título padrão do grupo é o da tela inicial; cada segmento troca o seu no próprio layout.
export const metadata = staffMetadata('Hoje');

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StaffLayoutClient>{children}</StaffLayoutClient>;
}
