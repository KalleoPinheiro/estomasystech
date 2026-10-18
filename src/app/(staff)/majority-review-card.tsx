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
import { formatDate } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

export interface MajorityReviewDto {
  patientId: string;
  fullName: string;
  birthDate: string | null;
  guardianName: string;
  guardianRelationship: string;
}

const relationshipLabel = (value: string): string =>
  GUARDIAN_RELATIONSHIP_LABELS[value as GuardianRelationship] ?? value;

/**
 * Aviso de maioridade (#372, ADR-032): o paciente fez 18 anos e o portal dele
 * ainda é só do responsável. A clínica transfere (cria a conta do paciente em
 * Configurações → Contas) ou mantém com o responsável (curatela, pedido dele).
 * Some quando não há ninguém.
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
        O portal destes pacientes ainda é acessado só pelo responsável. Passe o
        acesso ao próprio paciente criando a conta dele em{' '}
        <Link href="/configuracoes" className="text-accent-ink underline">
          Configurações
        </Link>
        , ou mantenha com o responsável quando houver curatela ou pedido do
        paciente.
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
                  · nascido(a) em {formatDate(item.birthDate)}
                </span>
              )}
              <span className="block text-ink-3">
                Responsável: {item.guardianName} (
                {relationshipLabel(item.guardianRelationship)})
              </span>
            </span>
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
          </li>
        ))}
      </ul>
    </SummaryCard>
  );
}
