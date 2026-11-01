import { requireStaffPageFor } from '@/lib/server/session';
import { staffMetadata } from '@/lib/staff-metadata';

export const metadata = staffMetadata('Triagem');

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaffPageFor('/triagem');
  return children;
}
