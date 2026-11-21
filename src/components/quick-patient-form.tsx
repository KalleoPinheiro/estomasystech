'use client';

import { Button, Input } from '@still-void/ui/react';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { parseBrazilianPhone } from '@/domain/shared/phone';
import { apiFetch } from '@/lib/client';
import type { PatientDto } from '@/lib/dto';

interface QuickPatientFormProps {
  /** Nome digitado na busca: o cadastro já abre com ele. */
  initialName?: string;
  onCreated: (patient: PatientDto) => void;
  onCancel: () => void;
}

interface QuickValues {
  fullName: string;
  phone: string;
  birthDate: string;
}

function validate(values: QuickValues): string | null {
  if (!values.fullName.trim()) return 'Informe o nome do paciente.';
  const phone = parseBrazilianPhone(values.phone);
  if (!phone.ok) return phone.reason;
  if (!values.birthDate) return 'Informe a data de nascimento do paciente.';
  return null;
}

/**
 * Cadastro rápido na nova consulta (#972): nome, celular e nascimento, sem sair
 * da tela. Não é um `<form>` porque vive dentro do formulário da consulta (HTML
 * não aninha formulários). O paciente nasce com o cadastro incompleto e o termo
 * de consentimento fica para o 1º atendimento.
 */
export function QuickPatientForm({
  initialName = '',
  onCreated,
  onCancel,
}: QuickPatientFormProps) {
  const [values, setValues] = useState<QuickValues>({
    fullName: initialName,
    phone: '',
    birthDate: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof QuickValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    const invalid = validate(values);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patient = await apiFetch<PatientDto>('/api/patients', {
        method: 'POST',
        body: JSON.stringify({
          fullName: values.fullName.trim(),
          phone: values.phone.trim(),
          birthDate: values.birthDate,
          quickRegistration: true,
        }),
      });
      onCreated(patient);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao cadastrar paciente',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset
      aria-label="Cadastro rápido de paciente"
      className="mt-1 grid gap-3 rounded-lg border border-border p-3"
    >
      <legend className="px-1 font-medium text-sm">Novo paciente</legend>
      <label className="font-medium text-sm">
        Nome completo *
        <Input
          autoComplete="off"
          value={values.fullName}
          onChange={(e) => set('fullName')(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Celular *
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="(11) 99999-0000"
          value={values.phone}
          onChange={(e) => set('phone')(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Data de nascimento *
        <Input
          type="date"
          value={values.birthDate}
          onChange={(e) => set('birthDate')(e.target.value)}
          className="mt-1"
        />
      </label>
      <p className="font-normal text-ink-3 text-xs">
        Os demais dados e o termo de consentimento ficam para o 1º atendimento.
      </p>
      {error ? <ErrorAlert message={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? 'Cadastrando…' : 'Cadastrar e selecionar'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </Button>
      </div>
    </fieldset>
  );
}
