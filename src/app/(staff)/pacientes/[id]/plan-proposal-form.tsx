'use client';

import { Button, Input, NativeSelect, Textarea } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { SafeForm } from '@/components/safe-form';
import type { ProcedureOptionDto } from '@/lib/dto';
import { formatCurrency } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

/** Mesmo limite do domínio (`PROPOSAL_TEXT_MAX`), sem puxar o domínio para o cliente. */
const TEXT_MAX = 1000;

const TEXT_FIELDS = [
  { key: 'objective', label: 'Objetivo do acompanhamento *', rows: 3 },
  { key: 'frequency', label: 'Frequência (ex.: 2x por semana)', rows: 1 },
  { key: 'duration', label: 'Duração estimada (ex.: 8 semanas)', rows: 1 },
  { key: 'modality', label: 'Modalidade (consultório, domicílio…)', rows: 1 },
  {
    key: 'therapies',
    label: 'Terapias indicadas (uma por linha, em palavras simples)',
    rows: 3,
  },
  { key: 'materials', label: 'Materiais (inclusos ou à parte)', rows: 2 },
  { key: 'payment', label: 'Formas de pagamento', rows: 2 },
  {
    key: 'emergencyContact',
    label: 'Contato para intercorrências',
    rows: 1,
  },
] as const;

type TextKey = (typeof TEXT_FIELDS)[number]['key'];

interface ProposalValues extends Record<TextKey, string> {
  procedureId: string;
  totalSessions: string;
  price: string;
  reassessmentOn: string;
}

const EMPTY: ProposalValues = {
  procedureId: '',
  totalSessions: '4',
  price: '',
  reassessmentOn: '',
  objective: '',
  frequency: '',
  duration: '',
  modality: '',
  therapies: '',
  materials: '',
  payment: '',
  emergencyContact: '',
};

const blankToNull = (value: string): string | null => value.trim() || null;

/** O PDF vem como anexo; salva no aparelho sem sair da ficha. */
function savePdf(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function requestProposal(
  patientId: string,
  values: ProposalValues,
): Promise<void> {
  const body = {
    patientId,
    procedureId: values.procedureId,
    totalSessions: Number(values.totalSessions),
    priceCents: Math.round(Number(values.price) * 100),
    reassessmentOn: blankToNull(values.reassessmentOn),
    ...Object.fromEntries(
      TEXT_FIELDS.map(({ key }) => [key, blankToNull(values[key])]),
    ),
  };
  const response = await fetch('/api/packages/proposta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) {
    const envelope = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(envelope?.error ?? 'Erro ao gerar a proposta');
  }
  const date = new Date().toISOString().slice(0, 10);
  savePdf(await response.blob(), `proposta-plano-${date}.pdf`);
}

/**
 * Proposta do plano de acompanhamento em PDF (#964): gerada na hora com o que
 * a equipe preencher, o preço avulso do procedimento, a validade de 1 mês e o
 * aviso de fatores individuais. Não fica guardada; a emissão vai para a
 * auditoria.
 */
export function PlanProposalForm({ patientId }: { patientId: string }) {
  const { toast } = useToast();
  const { data: catalog, error: catalogError } = useApiQuery<
    ProcedureOptionDto[]
  >('/api/options/procedures');
  const procedures = (catalog ?? []).filter((p) => p.active);
  const [values, setValues] = useState<ProposalValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof ProposalValues, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await requestProposal(patientId, values);
      toast({ description: 'Proposta gerada', variant: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar a proposta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="proposta-plano"
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
    >
      <h3 id="proposta-plano" className="font-medium text-sm">
        Proposta de plano (PDF)
      </h3>
      <p className="text-ink-3 text-sm">
        Vale por 1 mês a partir de hoje e sempre traz o aviso de que o resultado
        depende de fatores individuais. O texto não fica guardado.
      </p>
      {catalogError && <ErrorAlert message={catalogError} />}
      {error && <ErrorAlert message={error} />}
      <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="font-medium text-sm">
          Procedimento *
          <NativeSelect
            required
            value={values.procedureId}
            onChange={(e) => set('procedureId', e.target.value)}
            className="mt-1"
          >
            <option value="">Escolha o procedimento</option>
            {procedures.map((procedure) => (
              <option key={procedure.id} value={procedure.id}>
                {procedure.name} ({formatCurrency(procedure.priceCents)} avulsa)
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="font-medium text-sm">
            Consultas no plano *
            <Input
              required
              type="number"
              min="1"
              max="100"
              value={values.totalSessions}
              onChange={(e) => set('totalSessions', e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="font-medium text-sm">
            Preço do plano (R$) *
            <Input
              required
              type="number"
              min="0"
              step="0.01"
              value={values.price}
              onChange={(e) => set('price', e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="font-medium text-sm">
            Reavaliação
            <Input
              type="date"
              value={values.reassessmentOn}
              onChange={(e) => set('reassessmentOn', e.target.value)}
              className="mt-1"
            />
          </label>
        </div>
        {TEXT_FIELDS.map(({ key, label, rows }) => (
          <label key={key} className="font-medium text-sm">
            {label}
            <Textarea
              required={key === 'objective'}
              rows={rows}
              maxLength={TEXT_MAX}
              value={values[key]}
              onChange={(e) => set(key, e.target.value)}
              className="mt-1"
            />
          </label>
        ))}
        <Button
          type="submit"
          disabled={saving}
          variant="accent"
          className="self-start"
        >
          {saving ? 'Gerando…' : 'Gerar proposta (PDF)'}
        </Button>
      </SafeForm>
    </section>
  );
}
