'use client';

import { ErrorAlert } from '@/components/feedback';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Loaded } from '@/lib/server/data/load-block';

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

const isExpired = (pkg: PackageDto): boolean =>
  pkg.expiresAt !== null && new Date(pkg.expiresAt).getTime() <= Date.now();

/**
 * Pacotes pré-pagos do paciente: saldo e validade à vista da equipe (COMP3-10).
 * O servidor já escolheu a leitura certa por papel: o Profissional lê o saldo
 * sem preço (AD-027, #296); o Admin segue com o valor.
 */
export function PackagesSection({
  packages: block,
}: {
  packages: Loaded<PackageDto[]> | null;
}) {
  if (block?.error) return <ErrorAlert message={block.error} />;
  const packages = block?.data ?? [];
  if (packages.length === 0) {
    return (
      <p className="text-ink-3 text-sm">
        Nenhum pacote de sessões para este paciente.
      </p>
    );
  }

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
