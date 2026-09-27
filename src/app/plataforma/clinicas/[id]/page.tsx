'use client';

import { Icon } from '@still-void/ui/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import type { PlatformClinicDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';
import { registrationLabel } from '../../clinic-labels';
import { ClinicAdminsSection } from './clinic-admins-section';
import { ClinicRegistrationForm } from './clinic-registration-form';

/**
 * Detalhe de uma clínica na plataforma (B4, Journey 4–6): cadastro editável e
 * Admins de Empresa (convidar, reenviar convite, desativar, reativar).
 */
export default function PlatformClinicPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, errorStatus, refresh } = useApiQuery<PlatformClinicDto>(
    `/api/platform/clinics/${id}`,
  );

  return (
    <>
      <PageHeader
        leading={
          <Link
            href="/plataforma"
            className="inline-flex items-center gap-1 text-accent-ink text-sm hover:underline"
          >
            <Icon name="chevron-left" /> Clínicas
          </Link>
        }
        title={data?.name ?? 'Clínica'}
        badge={
          data ? (
            <RegistrationBadge complete={data.registrationComplete} />
          ) : null
        }
      />
      <ClinicContent
        clinic={data}
        error={errorStatus === 404 ? 'Clínica não encontrada' : error}
        onRetry={errorStatus === 404 ? undefined : refresh}
        onSaved={refresh}
      />
    </>
  );
}

function RegistrationBadge({ complete }: { complete: boolean }) {
  const { status, label } = registrationLabel(complete);
  return <StatusBadge status={status} label={label} />;
}

function ClinicContent({
  clinic,
  error,
  onRetry,
  onSaved,
}: {
  clinic: PlatformClinicDto | null;
  error: string | null;
  onRetry?: () => void;
  onSaved: () => void;
}) {
  if (error) return <ErrorAlert message={error} onRetry={onRetry} />;
  if (!clinic) return <LoadingIndicator />;
  return (
    <div className="flex flex-col gap-8">
      <ClinicRegistrationForm
        key={clinic.id}
        clinic={clinic}
        onSaved={onSaved}
      />
      <ClinicAdminsSection clinic={clinic} />
    </div>
  );
}
