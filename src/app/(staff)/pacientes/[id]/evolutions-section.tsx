'use client';

import { Button, Card, Textarea } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useEffect, useState } from 'react';
import {
  DraftRecoveredAlert,
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { apiFetch, isSessionExpiredError } from '@/lib/client';
import type { EvolutionNoteDto, ProfessionalOptionDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { useSessionDraft } from '@/lib/use-session-draft';

interface EvolutionsSectionProps {
  patientId: string;
  evolutions: EvolutionNoteDto[];
  /** Nomes dos autores, lidos no servidor (lista reduzida, #189). */
  professionals: ProfessionalOptionDto[];
  error: string | null;
  isLoading: boolean;
  onSaved: () => void;
  onRetry: () => void;
  /** Reporta se há SOAP não salvo — troca de aba pede confirmação (issue #66). */
  onDirtyChange: (dirty: boolean) => void;
}

const SOAP_FIELDS = [
  {
    key: 'subjective',
    label: 'S — Subjetivo',
    placeholder: 'Queixas relatadas pelo paciente',
  },
  {
    key: 'objective',
    label: 'O — Objetivo',
    placeholder: 'Achados do exame físico',
  },
  {
    key: 'assessment',
    label: 'A — Avaliação',
    placeholder: 'Interpretação clínica',
  },
  { key: 'plan', label: 'P — Plano', placeholder: 'Conduta e orientações' },
] as const;

type SoapKey = (typeof SOAP_FIELDS)[number]['key'];

const EMPTY: Record<SoapKey, string> = {
  subjective: '',
  objective: '',
  assessment: '',
  plan: '',
};

const EVOLUTIONS_VISIBLE_DEFAULT = 10;

function visibleEvolutions(
  evolutions: EvolutionNoteDto[],
  showAll: boolean,
): EvolutionNoteDto[] {
  return showAll ? evolutions : evolutions.slice(0, EVOLUTIONS_VISIBLE_DEFAULT);
}

export function EvolutionsSection({
  patientId,
  evolutions,
  professionals,
  error,
  isLoading,
  onSaved,
  onRetry,
  onDirtyChange,
}: EvolutionsSectionProps) {
  const { toast } = useToast();
  const [values, setValues] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // SOAP longo não se perde se a sessão expirar no salvamento (#207).
  const draft = useSessionDraft<Record<SoapKey, string>>(
    `soap:${patientId}`,
    (restored) => {
      setValues(restored);
      setShowForm(true);
    },
  );
  const professionalName = (id: string | null) =>
    professionals.find((p) => p.id === id)?.fullName ?? null;

  const isDirty = Object.values(values).some((value) => value.trim() !== '');
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      // Autoria vem sempre da sessão autenticada no servidor (#64) — o corpo
      // nunca carrega professionalId, então não há como um papel forjar a
      // atribuição de uma nota clínica a outro profissional.
      await apiFetch<EvolutionNoteDto>(
        `/api/patients/${patientId}/evolutions`,
        {
          method: 'POST',
          body: JSON.stringify(values),
        },
      );
      toast({ description: 'Evolução registrada', variant: 'success' });
      draft.dismiss();
      setValues(EMPTY);
      setShowForm(false);
      onSaved();
    } catch (err) {
      if (isSessionExpiredError(err)) draft.stash(values);
      setFormError(
        err instanceof Error ? err.message : 'Erro ao registrar evolução',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-ink-3 text-sm">
          Evoluções são imutáveis após registradas (integridade de prontuário).
        </p>
        <Button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          variant="accent"
        >
          {showForm ? 'Fechar' : '+ Nova evolução'}
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-lg border border-accent bg-accent-soft/40 p-4"
        >
          {draft.recovered && <DraftRecoveredAlert action="registre" />}
          {formError && <ErrorAlert message={formError} />}
          {SOAP_FIELDS.map((field) => (
            <label key={field.key} className="font-medium text-sm">
              {field.label}
              <Textarea
                rows={2}
                value={values[field.key]}
                placeholder={field.placeholder}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
                className="mt-1 w-full"
              />
            </label>
          ))}
          <Button
            type="submit"
            disabled={saving}
            variant="accent"
            className="self-start"
          >
            {saving ? 'Registrando…' : 'Registrar evolução'}
          </Button>
        </form>
      )}

      {isLoading ? (
        <LoadingIndicator />
      ) : error ? (
        <ErrorAlert message={error} onRetry={onRetry} />
      ) : evolutions.length === 0 ? (
        <EmptyState message="Nenhuma evolução registrada." />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {visibleEvolutions(evolutions, showAll).map((note) => (
              <Card as="li" key={note.id} className="p-4">
                <p className="mb-2 font-medium text-ink-3 text-xs">
                  {formatDateTime(note.createdAt)}
                  {professionalName(note.professionalId) && (
                    <span> · {professionalName(note.professionalId)}</span>
                  )}
                </p>
                <dl className="grid gap-2 text-sm">
                  {SOAP_FIELDS.map((field) => (
                    <div key={field.key}>
                      <dt className="font-semibold text-accent-ink">
                        {field.label}
                      </dt>
                      <dd className="whitespace-pre-wrap">
                        {note[field.key] || (
                          <span className="text-ink-3 italic">
                            — não preenchido —
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
          </ul>
          {!showAll && evolutions.length > EVOLUTIONS_VISIBLE_DEFAULT && (
            <Button
              type="button"
              onClick={() => setShowAll(true)}
              variant="link"
              className="h-auto self-start p-0"
            >
              Ver mais ({evolutions.length - EVOLUTIONS_VISIBLE_DEFAULT})
            </Button>
          )}
        </>
      )}
    </div>
  );
}
