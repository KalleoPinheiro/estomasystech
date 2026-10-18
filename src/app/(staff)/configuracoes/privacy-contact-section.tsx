'use client';

import { Button, Card, Input } from '@still-void/ui/react';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import type { ClinicRegistrationDto } from '@/lib/dto';
import { LEGAL_REVIEW_PENDING } from '@/lib/legal-text';
import { useApiQuery } from '@/lib/use-api-query';
import { useSavableForm } from '@/lib/use-savable-form';

/**
 * Encarregado pelos dados (LGPD, art. 41; #216, ADR-030): o nome e o canal que
 * o paciente vê nos termos de consentimento e no aviso de privacidade. Sem
 * eles, valem o contato da clínica. Só o Admin de Empresa edita.
 */
export function PrivacyContactSection() {
  const { data, error } = useApiQuery<{ info: ClinicRegistrationDto }>(
    '/api/settings/clinic-info',
  );
  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingIndicator />;
  return <PrivacyContactForm info={data.info} />;
}

function PrivacyContactForm({ info }: { info: ClinicRegistrationDto }) {
  const { draft, setDraft, saveError, save } = useSavableForm({
    endpoint: '/api/settings/clinic-info',
    initialValue: { dpoName: info.dpoName, dpoContact: info.dpoContact },
    successMessage: 'Encarregado pelos dados salvo',
    errorFallback: 'Erro ao salvar o encarregado pelos dados',
  });

  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Privacidade (LGPD)</h2>
      <p className="mb-4 text-ink-3 text-sm">
        O encarregado é quem o paciente procura para tirar dúvidas e pedir
        acesso, correção ou eliminação dos dados. Nome e canal aparecem nos
        termos de consentimento e no aviso de privacidade. Se ficarem em branco,
        vale o e-mail ou telefone de contato da clínica.
      </p>
      {LEGAL_REVIEW_PENDING && (
        <p className="mb-4 font-medium text-sm text-warning">
          Os textos de consentimento e o aviso de privacidade em vigor foram
          redigidos sem revisão de profissional jurídico. Peça a revisão antes
          de atender pacientes reais.
        </p>
      )}
      {saveError && <ErrorAlert message={saveError} />}
      <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="font-medium text-sm">
          Nome do encarregado
          <Input
            value={draft.dpoName ?? ''}
            placeholder="Nome do encarregado"
            onChange={(e) => setDraft({ ...draft, dpoName: e.target.value })}
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          E-mail ou telefone do encarregado
          <Input
            value={draft.dpoContact ?? ''}
            placeholder="privacidade@clinica.com.br"
            onChange={(e) => setDraft({ ...draft, dpoContact: e.target.value })}
            className="mt-1"
          />
        </label>
      </div>
      <Button
        type="button"
        onClick={() => void save()}
        variant="accent"
        className="mt-4"
      >
        Salvar encarregado
      </Button>
    </Card>
  );
}
