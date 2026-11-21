'use client';

import { Button, Card } from '@still-void/ui/react';
import { ClinicFieldsGrid, clinicFieldKeys } from '@/components/clinic-fields';
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
  // Profissional autônoma (#977): CPF e COREN dela, sem "clínica" na tela.
  const individual = info.kind === 'individual';
  const noun = individual ? 'cadastrais' : 'da clínica';
  const { draft, setDraft, saveError, save } = useSavableForm({
    endpoint: '/api/settings/clinic-info',
    initialValue: info,
    successMessage: `Dados ${noun} salvos`,
    errorFallback: `Erro ao salvar dados ${noun}`,
    onSaved,
  });

  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Dados {noun}</h2>
      <p className="mb-4 text-ink-3 text-sm">
        {individual
          ? 'Seu nome, CPF e registro no conselho (COREN) aparecem em todo documento emitido (atestado, relatório, plano de cuidados e recibo). Telefone e e-mail de contato são por onde a plataforma fala com você.'
          : 'Razão social, CNPJ e responsável técnico aparecem em todo documento clínico emitido (atestado, relatório, plano de cuidados). Telefone e e-mail de contato são por onde a plataforma fala com a clínica.'}
      </p>
      {saveError && <ErrorAlert message={saveError} />}
      <CnpjReviewAlert since={info.cnpjReviewSince} />

      <ClinicFieldsGrid
        draft={draft}
        keys={clinicFieldKeys(info)}
        onChange={setDraft}
      />

      <Button
        type="button"
        onClick={() => void save()}
        variant="accent"
        className="mt-4"
      >
        Salvar dados {noun}
      </Button>
    </Card>
  );
}
