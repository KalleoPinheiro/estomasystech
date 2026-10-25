import { CardSkeleton } from '@still-void/ui/react';
import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { GUARDIAN_MANAGER_ROLES } from '@/lib/auth/guardian-access';
import { formatDate } from '@/lib/format';
import { requireStaffPage } from '@/lib/server/session';
import { canRoleAccess } from '@/lib/staff-pages';
import { FollowUpsCard } from './_hoje/follow-ups-card';
import { KpiGrid } from './_hoje/kpi-grid';
import { LowStockCard } from './_hoje/low-stock-card';
import { MajorityCard } from './_hoje/majority-card';
import { PendingClosureCard } from './_hoje/pending-closure';
import { TodayAppointmentsCard } from './_hoje/today-appointments';
import { TriageCard } from './_hoje/triage-card';

/**
 * Tela Hoje no servidor (#548, ADR-069): cada bloco lê o próprio dado e tem o
 * próprio `<Suspense>`, então o mais lento não segura a tela. Cada bloco só
 * existe para quem pode usá-lo (#199): Atendente e Profissional não têm resumo
 * financeiro nem estoque. A carga não chama `/api`; as ações rápidas
 * (concluir/cancelar retorno, triagem, maioridade) são Server Actions.
 */
export default async function DashboardPage() {
  const session = await requireStaffPage({ next: '/' });
  const showFinance = canRoleAccess('/api/summary', session.role);
  const showStock = canRoleAccess('/api/supplies', session.role);
  const showTriage = canRoleAccess('/api/photos/triage', session.role);
  // Aviso de maioridade (#372): só quem gerencia responsáveis decide.
  const showMajority = GUARDIAN_MANAGER_ROLES.includes(session.role);

  return (
    <div>
      <PageHeader
        title="Hoje"
        description={formatDate(new Date().toISOString())}
      />

      {showFinance && (
        <Suspense fallback={<KpiSkeleton />}>
          <KpiGrid session={session} />
        </Suspense>
      )}

      {showTriage && (
        <Suspense fallback={null}>
          <TriageCard session={session} />
        </Suspense>
      )}

      {showMajority && (
        <Suspense fallback={null}>
          <MajorityCard session={session} />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <PendingClosureCard session={session} />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Suspense fallback={<CardSkeleton />}>
          <TodayAppointmentsCard session={session} />
        </Suspense>

        <div className="flex flex-col gap-6">
          <Suspense fallback={<CardSkeleton />}>
            <FollowUpsCard session={session} />
          </Suspense>
          {showStock && (
            <Suspense fallback={<CardSkeleton />}>
              <LowStockCard session={session} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div
      aria-busy="true"
      className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
    >
      {['a', 'b', 'c', 'd'].map((key) => (
        <CardSkeleton key={key} />
      ))}
    </div>
  );
}
