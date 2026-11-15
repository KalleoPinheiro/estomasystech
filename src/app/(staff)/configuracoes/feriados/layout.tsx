import type { ReactNode } from 'react';
import { SectionPrefetch } from '../section-prefetch';

export default function Layout({ children }: { children: ReactNode }) {
  return <SectionPrefetch slug="feriados">{children}</SectionPrefetch>;
}
