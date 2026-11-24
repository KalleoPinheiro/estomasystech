'use client';

import { ErrorAlert } from '@/components/feedback';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Loaded } from '@/lib/server/data/load-block';
import { PlanProposalForm } from './plan-proposal-form';

export interface PackageDto {
  id: string;
  procedureId: string;
  procedureName?: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  /** Ausente para o Profissional: a API de saldo não devolve valores (AD-027). */
  priceCents?: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

/** Uma frase que explica o conceito na própria aba (#957). */
const EXPLICACAO =
  'Plano de acompanhamento é um número fechado de sessões vendido por um preço único. O saldo mostra quantas sessões ainda restam, a validade diz até quando podem ser usadas e cada sessão vale o preço do plano dividido pelo número de sessões.';

const isExpired = (pkg: PackageDto): boolean =>
  pkg.expiresAt !== null && new Date(pkg.expiresAt).getTime() <= Date.now();

/**
 * Planos de acompanhamento do paciente (pacote pré-pago de sessões, #957): saldo e validade à vista da equipe (COMP3-10).
 * O servidor já escolheu a leitura certa por papel: o Profissional lê o saldo
 * sem preço (AD-027, #296); o Admin segue com o valor.
 */
export function PackagesSection({
  packages: block,
  patientId,
  canPropose = false,
}: {
  packages: Loaded<PackageDto[]> | null;
  patientId?: string;
  /** Só o Admin: a proposta leva preço (#964). */
  canPropose?: boolean;
}) {
  if (block?.error) return <ErrorAlert message={block.error} />;
  const packages = block?.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2 text-sm">{EXPLICACAO}</p>
      {packages.length === 0 ? (
        <p className="text-ink-3 text-sm">
          Nenhum plano de acompanhamento para este paciente.
        </p>
      ) : (
        <PackageList packages={packages} />
      )}
      {canPropose && patientId && <PlanProposalForm patientId={patientId} />}
    </div>
  );
}

function PackageList({ packages }: { packages: PackageDto[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {packages.map((pkg) => (
        <li
          key={pkg.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border p-3 text-sm"
        >
          <span className="font-medium">
            {pkg.procedureName ?? 'Procedimento'}
          </span>
          <span className="text-ink-2">
            {pkg.remainingSessions} de {pkg.totalSessions} sessões restantes
          </span>
          {pkg.priceCents !== undefined && (
            <span className="text-ink-3">{formatCurrency(pkg.priceCents)}</span>
          )}
          <span
            className={
              isExpired(pkg) ? 'font-medium text-danger' : 'text-ink-3'
            }
          >
            {pkg.expiresAt
              ? `${isExpired(pkg) ? 'Expirado em' : 'Válido até'} ${formatDate(pkg.expiresAt)}`
              : 'Sem validade'}
          </span>
        </li>
      ))}
    </ul>
  );
}
