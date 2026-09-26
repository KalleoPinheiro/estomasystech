'use client';

import { Card } from '@still-void/ui/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { LoadingIndicator } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import {
  staffPageFor,
  useStaffAccess,
  useStaffIdentity,
} from '@/lib/staff-access';

/**
 * Tela que o papel não pode usar (#199) mostra um estado "sem permissão" em
 * vez de montar a página — que dispararia chamadas 403 e alertas de erro de
 * API. Esconder não é a barreira (a API é, ADR-002); é UX.
 */
export function RoleGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const can = useStaffAccess();
  const state = useStaffIdentity();
  const page = staffPageFor(pathname);

  if (!page || can(page.api)) {
    return children;
  }
  if (state?.loading) {
    return <LoadingIndicator />;
  }
  return (
    <div data-role-denied>
      <PageHeader title={page.label} />
      <Card className="p-5">
        <p className="font-medium">Seu papel não tem acesso a esta tela.</p>
        <p className="mt-1 text-ink-3 text-sm">
          Se precisar dela, fale com o administrador da clínica.
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex font-medium text-accent-ink text-sm hover:underline"
        >
          Voltar ao início
        </Link>
      </Card>
    </div>
  );
}
