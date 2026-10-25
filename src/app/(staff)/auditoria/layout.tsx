import { requireStaffPageFor } from '@/lib/server/session';
import { staffMetadata } from '@/lib/staff-metadata';

export const metadata = staffMetadata('Auditoria');

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaffPageFor('/auditoria');
  return children;
}
