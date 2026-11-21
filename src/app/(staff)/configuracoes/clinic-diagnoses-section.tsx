'use client';

import { Button, Card, Input } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { type ChangeEvent, useState } from 'react';
import { EmptyState, ErrorAlert } from '@/components/feedback';
import { FilePicker } from '@/components/file-picker';
import { SafeForm } from '@/components/safe-form';
import { unwrapAction } from '@/lib/action-result';
import type { ClinicNursingDiagnosisDto } from '@/lib/dto';
import {
  createClinicDiagnosis,
  importClinicDiagnoses,
  setClinicDiagnosisActive,
} from './diagnosticos/diagnosis-actions';

/** Arquivo maior que isso não é a lista de uma clínica. */
const CSV_MAX_BYTES = 1_000_000;

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback;

/**
 * Catálogo de diagnósticos da clínica (#954): o que aparece primeiro na busca do plano de
 * cuidados. Cadastro um a um ou CSV exportado da planilha da clínica. Mobile first: uma coluna
 * no celular, duas a partir de `sm`.
 */
export function ClinicDiagnosesSection({
  diagnoses,
}: {
  diagnoses: ClinicNursingDiagnosisDto[];
}) {
  return (
    <>
      <Card as="section" className="p-5">
        <h2 className="mb-1 font-semibold text-lg">Cadastrar diagnóstico</h2>
        <p className="mb-4 text-ink-3 text-sm">
          Os diagnósticos daqui aparecem primeiro na busca do plano de cuidados.
          O código NANDA-I é opcional: sem ele, o diagnóstico sai como «sem
          código».
        </p>
        <CreateDiagnosisForm />
      </Card>
      <Card as="section" className="p-5">
        <h2 className="mb-1 font-semibold text-lg">Importar planilha (CSV)</h2>
        <p className="mb-4 text-ink-3 text-sm">
          Salve a planilha como CSV com a coluna <strong>titulo</strong> e, se
          quiser, <strong>codigo</strong>, <strong>dominio</strong>,{' '}
          <strong>classe</strong>, <strong>edicao</strong> e{' '}
          <strong>definicao</strong>. Títulos que já estão no catálogo são
          pulados, então pode reenviar o mesmo arquivo corrigido.
        </p>
        <ImportCsvForm />
      </Card>
      <Card as="section" className="p-5">
        <h2 className="mb-3 font-semibold text-lg">
          Catálogo da clínica ({diagnoses.length})
        </h2>
        <DiagnosisList diagnoses={diagnoses} />
      </Card>
    </>
  );
}

const EMPTY_DRAFT = {
  code: '',
  label: '',
  domain: '',
  class: '',
  edition: '',
};

function CreateDiagnosisForm() {
  const { toast } = useToast();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field =
    (name: keyof typeof EMPTY_DRAFT) => (e: ChangeEvent<HTMLInputElement>) =>
      setDraft({ ...draft, [name]: e.target.value });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(createClinicDiagnosis(draft));
      toast({ description: 'Diagnóstico cadastrado', variant: 'success' });
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(errorMessage(err, 'Erro ao cadastrar o diagnóstico'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="font-medium text-sm sm:col-span-2">
          Título
          <Input
            value={draft.label}
            onChange={field('label')}
            required
            maxLength={200}
            placeholder="Ex.: Integridade da pele prejudicada"
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Código NANDA-I (opcional)
          <Input
            value={draft.code}
            onChange={field('code')}
            inputMode="numeric"
            maxLength={5}
            placeholder="00046"
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Edição (opcional)
          <Input
            value={draft.edition}
            onChange={field('edition')}
            maxLength={120}
            placeholder="NANDA-I 2024-2026"
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Domínio (opcional)
          <Input
            value={draft.domain}
            onChange={field('domain')}
            maxLength={120}
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Classe (opcional)
          <Input
            value={draft.class}
            onChange={field('class')}
            maxLength={120}
            className="mt-1"
          />
        </label>
      </div>
      <Button
        type="submit"
        disabled={saving}
        variant="accent"
        className="self-start"
      >
        {saving ? 'Salvando…' : 'Cadastrar diagnóstico'}
      </Button>
    </SafeForm>
  );
}

interface ImportSummary {
  created: number;
  duplicates: { line: number; message: string }[];
  errors: { line: number; message: string }[];
}

function ImportCsvForm() {
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSummary(null);
    setError(null);
    if (file.size > CSV_MAX_BYTES) {
      setError('O arquivo passa de 1 MB. Confira se é a planilha certa.');
      return;
    }
    setSaving(true);
    try {
      const csv = await file.text();
      setSummary(await unwrapAction(importClinicDiagnoses({ csv })));
    } catch (err) {
      setError(errorMessage(err, 'Erro ao importar a planilha'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <FilePicker
        accept=".csv,text/csv"
        disabled={saving}
        aria-label="Planilha de diagnósticos (CSV)"
        onChange={(event) => void handleFile(event)}
      />
      {saving && <p className="text-ink-3 text-sm">Importando…</p>}
      {summary && <ImportResult summary={summary} />}
    </div>
  );
}

function ImportResult({ summary }: { summary: ImportSummary }) {
  const issues = [...summary.errors, ...summary.duplicates].sort(
    (a, b) => a.line - b.line,
  );
  return (
    <div className="text-sm" role="status">
      <p className="font-medium">
        {summary.created} diagnóstico(s) importado(s).
        {summary.duplicates.length > 0 &&
          ` ${summary.duplicates.length} já estava(m) no catálogo.`}
        {summary.errors.length > 0 &&
          ` ${summary.errors.length} linha(s) com problema.`}
      </p>
      {issues.length > 0 && (
        <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto text-ink-3">
          {issues.map((issue) => (
            <li key={`${issue.line}-${issue.message}`}>
              Linha {issue.line}: {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DiagnosisList({
  diagnoses,
}: {
  diagnoses: ClinicNursingDiagnosisDto[];
}) {
  if (diagnoses.length === 0) {
    return (
      <EmptyState message="Nenhum diagnóstico cadastrado. A busca do plano mostra só o catálogo padrão." />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {diagnoses.map((diagnosis) => (
        <DiagnosisItem key={diagnosis.id} diagnosis={diagnosis} />
      ))}
    </ul>
  );
}

function DiagnosisItem({
  diagnosis,
}: {
  diagnosis: ClinicNursingDiagnosisDto;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const details = [diagnosis.domain, diagnosis.class, diagnosis.edition]
    .filter(Boolean)
    .join(' · ');

  const toggle = async () => {
    setSaving(true);
    try {
      await unwrapAction(
        setClinicDiagnosisActive({
          id: diagnosis.id,
          active: !diagnosis.active,
        }),
      );
    } catch (err) {
      toast({
        description: errorMessage(err, 'Erro ao atualizar o diagnóstico'),
        variant: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-lg bg-bg p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className={diagnosis.active ? 'font-medium' : 'text-ink-3'}>
          <span className="mr-2 rounded-full bg-accent-soft px-2 py-0.5 text-accent-ink text-xs">
            {diagnosis.code ?? 'Sem código'}
          </span>
          {diagnosis.label}
          {!diagnosis.active && ' (desativado)'}
        </p>
        {details && <p className="mt-1 text-ink-3 text-xs">{details}</p>}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={saving}
        onClick={() => void toggle()}
        className="min-h-11 self-start sm:self-auto"
      >
        {diagnosis.active ? 'Desativar' : 'Reativar'}
      </Button>
    </li>
  );
}
