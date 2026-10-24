'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { staffPageFor } from '@/lib/staff-access';

/** Marca no fim do título de toda tela da equipe. */
export const DOCUMENT_TITLE_SUFFIX = 'EstomaSysTech';

/** Título da aba por tela da equipe (WCAG 2.4.2): "Agenda — EstomaSysTech". */
export function staffDocumentTitle(pathname: string): string | undefined {
  const page = staffPageFor(pathname);
  return page ? `${page.label} — ${DOCUMENT_TITLE_SUFFIX}` : undefined;
}

export function useStaffDocumentTitle() {
  const pathname = usePathname();
  useEffect(() => {
    const title = staffDocumentTitle(pathname);
    if (title) {
      document.title = title;
    }
  }, [pathname]);
}
