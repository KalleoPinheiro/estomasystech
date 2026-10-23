import { staffMetadata } from '@/lib/staff-metadata';

export const metadata = staffMetadata('Pedidos do titular');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
