'use client';

import { Button, Card } from '@still-void/ui/react';
import {
  ALL_CLINIC_FIELDS,
  ClinicFieldsGrid,
} from '@/components/clinic-fields';
import {
  CnpjReviewAlert,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import type { ClinicRegistrationDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';
import { useSavableForm } from '@/lib/use-savable-form';

/**
 * Dados cadastrais da clínica (issue #61) — CNPJ e responsável técnico
 * alimentam o cabeçalho/rodapé dos documentos emitidos (#62); sem eles, a
 * emissão é bloqueada (fail-closed) nas páginas de documento.
 */
export function ClinicInfoSection() {
  const { data, error, refresh } = useApiQuery<{ info: ClinicRegistrationDto }>(
    '/api/settings/clinic-info',
  );

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingIndicator />;

  return <ClinicInfoForm info={data.info} onSaved={refresh} />;
}

function ClinicInfoForm({
  info,
  onSaved,
}: {
  info: ClinicRegistrationDto;
  onSaved: () => void;
}) {
  const { draft, setDraft, saveError, save } = useSavableForm({
    endpoint: '/api/settings/clinic-info',
    initialValue: info,
    successMessage: 'Dados da clínica salvos',
    errorFallback: 'Erro ao salvar dados da clínica',
    onSaved,
  });

  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Dados da clínica</h2>
      <p className="mb-4 text-ink-3 text-sm">
        Razão social, CNPJ e responsável técnico aparecem em todo documento
        clínico emitido (atestado, relatório, plano de cuidados). Telefone e
        e-mail de contato são por onde a plataforma fala com a clínica.
      </p>
      {saveError && <ErrorAlert message={saveError} />}
      <CnpjReviewAlert since={info.cnpjReviewSince} />

      <ClinicFieldsGrid
        draft={draft}
        keys={ALL_CLINIC_FIELDS}
        onChange={setDraft}
      />

      <Button
        type="button"
        onClick={() => void save()}
        variant="accent"
        className="mt-4"
      >
        Salvar dados da clínica
      </Button>
    </Card>
  );
}
