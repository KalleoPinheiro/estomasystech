import { staffMetadata } from '@/lib/staff-metadata';

export const metadata = staffMetadata('Parceiros');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
