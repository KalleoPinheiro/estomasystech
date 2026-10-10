'use client';

import { Button, Textarea } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useEffect, useState } from 'react';
import {
  DraftRecoveredAlert,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { apiFetch, isSessionExpiredError } from '@/lib/client';
import type { AnamnesisDto } from '@/lib/dto';
import { useSessionDraft } from '@/lib/use-session-draft';

interface AnamnesisSectionProps {
  patientId: string;
  anamnesis: AnamnesisDto | null;
  /** Erro ao *carregar* a anamnese — distinto de "sem histórico" (issue #65). */
  error: string | null;
  isLoading: boolean;
  onSaved: () => void;
  onRetry: () => void;
  /** Reporta se há alteração não salva — troca de aba pede confirmação (issue #66). */
  onDirtyChange: (dirty: boolean) => void;
}

const FIELDS = [
  {
    key: 'comorbidities',
    label: 'Comorbidades',
    placeholder: 'Ex.: Diabetes tipo 2, HAS',
  },
  {
    key: 'allergies',
    label: 'Alergias',
    placeholder: 'Ex.: adesivo hidrocoloide, látex',
  },
  {
    key: 'medications',
    label: 'Medicações em uso',
    placeholder: 'Ex.: Metformina 850mg 2x/dia',
  },
  {
    key: 'surgicalHistory',
    label: 'Histórico cirúrgico',
    placeholder: 'Ex.: Colectomia (2024)',
  },
  { key: 'notes', label: 'Observações', placeholder: '' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

const toFormValues = (
  anamnesis: AnamnesisDto | null,
): Record<FieldKey, string> => {
  const entries = FIELDS.map((field) => [
    field.key,
    anamnesis ? anamnesis[field.key] : '',
  ]);
  return Object.fromEntries(entries) as Record<FieldKey, string>;
};

export function AnamnesisSection({
  patientId,
  anamnesis,
  error,
  isLoading,
  onSaved,
  onRetry,
  onDirtyChange,
}: AnamnesisSectionProps) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<FieldKey, string>>(() =>
    toFormValues(anamnesis),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Anamnese não se perde se a sessão expirar no salvamento (#207). Só
  // restaura com a anamnese carregada: a seção remonta quando ela chega.
  const draft = useSessionDraft<Record<FieldKey, string>>(
    `anamnesis:${patientId}`,
    setValues,
    !isLoading && !error,
  );

  const baseline = toFormValues(anamnesis);
  const isDirty = FIELDS.some(
    (field) => values[field.key] !== baseline[field.key],
  );
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await apiFetch<AnamnesisDto>(`/api/patients/${patientId}/anamnesis`, {
        method: 'PUT',
        body: JSON.stringify(values),
      });
      toast({ description: 'Anamnese salva', variant: 'success' });
      draft.dismiss();
      onSaved();
    } catch (err) {
      if (isSessionExpiredError(err)) draft.stash(values);
      setFormError(
        err instanceof Error ? err.message : 'Erro ao salvar anamnese',
      );
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingIndicator />;
  if (error) return <ErrorAlert message={error} onRetry={onRetry} />;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {draft.recovered && <DraftRecoveredAlert action="salve" />}
      {formError && <ErrorAlert message={formError} />}
      {FIELDS.map((field) => (
        <label key={field.key} className="font-medium text-sm">
          {field.label}
          <Textarea
            rows={2}
            value={values[field.key]}
            placeholder={field.placeholder}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
            }
            className="mt-1 w-full"
          />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving} variant="accent">
          {saving ? 'Salvando…' : 'Salvar anamnese'}
        </Button>
      </div>
    </form>
  );
}
