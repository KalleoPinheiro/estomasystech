'use client';

import { Button, Card } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import {
  ALL_CLINIC_FIELDS,
  ClinicFieldsGrid,
  REQUIRED_CLINIC_FIELDS,
} from '@/components/clinic-fields';
import { CnpjReviewAlert, ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';
import type { PlatformClinicDto } from '@/lib/dto';

/** Edição do cadastro pelo super_admin (Journey 6) — `PATCH` do cadastro inteiro. */
export function ClinicRegistrationForm({
  clinic,
  onSaved,
}: {
  clinic: PlatformClinicDto;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(clinic);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/platform/clinics/${clinic.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: draft.name,
          cnpj: draft.cnpj,
          contactPhone: draft.contactPhone,
          contactEmail: draft.contactEmail,
          professionalName: draft.professionalName,
          professionalRegistry: draft.professionalRegistry,
          address: draft.address,
          city: draft.city,
        }),
      });
      toast({ description: 'Cadastro da clínica salvo', variant: 'success' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cadastro');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Cadastro</h2>
      <p className="mb-4 text-ink-3 text-sm">
        Nome, CNPJ, telefone e e-mail de contato são exigidos para convidar o
        Admin de Empresa.
      </p>
      {error && <ErrorAlert message={error} />}
      <CnpjReviewAlert since={clinic.cnpjReviewSince} />
      <ClinicFieldsGrid
        draft={draft}
        keys={ALL_CLINIC_FIELDS}
        required={REQUIRED_CLINIC_FIELDS}
        onChange={setDraft}
      />
      <Button
        type="button"
        variant="accent"
        className="mt-4"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? 'Salvando…' : 'Salvar cadastro'}
      </Button>
    </Card>
  );
}
