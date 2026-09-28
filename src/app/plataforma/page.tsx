'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import Link from 'next/link';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import type { PlatformClinicSummaryDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';
import {
  ADMIN_STATUS_LABEL,
  CLINIC_STATUS_LABEL,
  registrationLabel,
} from './clinic-labels';

/**
 * Clínicas da plataforma (B4, #214): situação (B5), cadastro e estado do admin
 * de cada uma.
 */
export default function PlatformPage() {
  const { data, error, refresh } = useApiQuery<PlatformClinicSummaryDto[]>(
    '/api/platform/clinics',
  );

  return (
    <>
      <PageHeader
        title="Plataforma"
        description="Clínicas cadastradas e o Admin de Empresa de cada uma."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/plataforma/auditoria"
              className="font-medium text-accent-ink text-sm hover:underline"
            >
              Trilha da plataforma
            </Link>
            <Link
              href="/plataforma/clinicas/nova"
              className="font-medium text-accent-ink text-sm hover:underline"
            >
              Nova clínica
            </Link>
          </div>
        }
      />
      <ClinicsContent data={data} error={error} onRetry={refresh} />
    </>
  );
}

function ClinicsContent({
  data,
  error,
  onRetry,
}: {
  data: PlatformClinicSummaryDto[] | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) return <ErrorAlert message={error} onRetry={onRetry} />;
  if (!data) return <LoadingIndicator />;
  if (data.length === 0) {
    return <EmptyState message="Nenhuma clínica cadastrada." />;
  }
  return (
    <div className="overflow-x-auto">
      <Table stack className="w-full text-left text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="py-2 pr-3">Nome</TableHead>
            <TableHead className="py-2 pr-3">CNPJ</TableHead>
            <TableHead className="py-2 pr-3">Situação</TableHead>
            <TableHead className="py-2 pr-3">Cadastro</TableHead>
            <TableHead className="py-2">Admin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((clinic) => (
            <ClinicRow key={clinic.id} clinic={clinic} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ClinicRow({ clinic }: { clinic: PlatformClinicSummaryDto }) {
  const registration = registrationLabel(clinic.registrationComplete);
  const admin = ADMIN_STATUS_LABEL[clinic.adminStatus];
  const situation = CLINIC_STATUS_LABEL[clinic.status];
  return (
    <TableRow>
      <TableCell label="Nome" className="py-2 pr-3 font-medium">
        <Link
          href={`/plataforma/clinicas/${clinic.id}`}
          className="text-accent-ink hover:underline"
        >
          {clinic.name}
        </Link>
      </TableCell>
      <TableCell label="CNPJ" className="py-2 pr-3 text-ink-2">
        {clinic.cnpj ?? '—'}
      </TableCell>
      <TableCell label="Situação" className="py-2 pr-3">
        <StatusBadge status={situation.status} label={situation.label} />
      </TableCell>
      <TableCell label="Cadastro" className="py-2 pr-3">
        <StatusBadge status={registration.status} label={registration.label} />
      </TableCell>
      <TableCell label="Admin" className="py-2">
        <StatusBadge status={admin.status} label={admin.label} />
      </TableCell>
    </TableRow>
  );
}
