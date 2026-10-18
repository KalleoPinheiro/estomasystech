'use client';

import { Button } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import Link from 'next/link';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { SummaryCard } from '@/components/summary-card';
import {
  GUARDIAN_RELATIONSHIP_LABELS,
  type GuardianRelationship,
} from '@/domain/guardian/guardian';
import { apiFetch } from '@/lib/client';
import { useApiQuery } from '@/lib/use-api-query';

export interface MajorityReviewDto {
  patientId: string;
  fullName: string;
  birthDate: string | null;
  guardianName: string;
  guardianRelationship: string;
  /** Ainda só com o responsável no portal: transferir ou manter (#372). */
  awaitingTransfer?: boolean;
  /** Dia em que o aceite do representante deixa de valer (#375); nulo sem aceite dele. */
  representativeConsentExpiresOn?: string | null;
  representativeConsentExpired?: boolean;
}

/**
 * Data civil gravada à meia-noite UTC, mostrada sem passar pelo fuso do
 * navegador (no Brasil, `toLocaleDateString` mostraria o dia anterior).
 */
const civilDate = (iso: string): string =>
  iso.slice(0, 10).split('-').reverse().join('/');

const relationshipLabel = (value: string): string =>
  GUARDIAN_RELATIONSHIP_LABELS[value as GuardianRelationship] ?? value;

/**
 * Aviso de maioridade (#372, ADR-032): o paciente fez 18 anos e o portal dele
 * ainda é só do responsável. A clínica transfere (cria a conta do paciente em
 * Configurações → Contas) ou mantém com o responsável (curatela, pedido dele).
 * Também avisa quando o aceite dado pelo representante vence, 90 dias depois
 * dos 18 anos (#375, ADR-033). Some quando não há ninguém.
 */
export function MajorityReviewCard() {
  const { toast } = useToast();
  const { data, error, isLoading, refresh } = useApiQuery<MajorityReviewDto[]>(
    '/api/guardians/majority',
  );
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const keep = async (patientId: string) => {
    setSubmittingId(patientId);
    try {
      await apiFetch(`/api/guardians/majority/${patientId}/keep`, {
        method: 'POST',
      });
      toast({
        description: 'Acesso mantido com o responsável',
        variant: 'success',
      });
      refresh();
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : 'Erro ao registrar a decisão',
        variant: 'danger',
      });
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <SummaryCard
      title={`Pacientes que fizeram 18 anos (${data?.length ?? 0})`}
      titleClassName="font-bold text-sm text-warning"
      titleTag="h3"
      headerClassName="mb-2 flex items-center justify-between"
      cardClassName="mb-6 border-warning bg-warning-soft p-4"
      error={error}
      isLoading={isLoading}
      onRetry={refresh}
      isEmpty={!data || data.length === 0}
      hideWhenEmpty
    >
      <p className="mb-2 text-ink-2 text-sm">
        Quando o portal ainda é só do responsável, passe o acesso ao próprio
        paciente criando a conta dele em{' '}
        <Link href="/configuracoes" className="text-accent-ink underline">
          Configurações
        </Link>
        , ou mantenha com o responsável quando houver curatela ou pedido do
        paciente. Os termos aceitos pelo responsável valem até 90 dias depois
        dos 18 anos: peça ao paciente que aceite em nome próprio no portal.
      </p>
      <ul className="divide-y divide-border text-sm">
        {(data ?? []).map((item) => (
          <li
            key={item.patientId}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <span className="min-w-0">
              <Link
                href={`/pacientes/${item.patientId}`}
                className="font-medium hover:underline"
              >
                {item.fullName}
              </Link>
              {item.birthDate && (
                <span className="text-ink-3">
                  {' '}
                  · nascido(a) em {civilDate(item.birthDate)}
                </span>
              )}
              <span className="block text-ink-3">
                Responsável: {item.guardianName} (
                {relationshipLabel(item.guardianRelationship)})
              </span>
              <RepresentativeConsentLine item={item} />
            </span>
            {item.awaitingTransfer !== false && (
              <ConfirmAction
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={submittingId === item.patientId}
                  >
                    Manter com o responsável
                  </Button>
                }
                title="Manter o acesso com o responsável?"
                description="O paciente já é maior de idade. Mantenha só se houver curatela ou se o próprio paciente pediu. A decisão fica na trilha de auditoria."
                confirmLabel="Manter"
                onConfirm={() => keep(item.patientId)}
              />
            )}
          </li>
        ))}
      </ul>
    </SummaryCard>
  );
}

function RepresentativeConsentLine({ item }: { item: MajorityReviewDto }) {
  if (!item.representativeConsentExpiresOn) return null;
  const date = civilDate(item.representativeConsentExpiresOn);
  return item.representativeConsentExpired ? (
    <span className="block text-danger" data-representative-consent="expired">
      O aceite do responsável venceu em {date}: peça ao paciente que aceite em
      nome próprio no portal.
    </span>
  ) : (
    <span className="block text-ink-2" data-representative-consent="valid">
      O aceite do responsável vence em {date}.
    </span>
  );
}
