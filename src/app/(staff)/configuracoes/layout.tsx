import { requireStaffPageFor } from '@/lib/server/session';
import { staffMetadata } from '@/lib/staff-metadata';

export const metadata = staffMetadata('Configurações');

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaffPageFor('/configuracoes');
  return children;
}
