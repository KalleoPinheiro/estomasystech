'use client';

import { Button, Input, NativeSelect, Textarea } from '@still-void/ui/react';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { normalizeOptionalCpf } from '@/domain/shared/cpf';
import { parseBrazilianPhone } from '@/domain/shared/phone';
import type { PartnerDto, PatientDto } from '@/lib/dto';

export interface PatientFormValues {
  fullName: string;
  email: string;
  phone: string;
  /** Vazio na edição mantém o CPF guardado (a ficha só mostra a máscara). */
  cpf: string;
  birthDate: string;
  notes: string;
  referredByPartnerId: string;
}

interface PatientFormProps {
  initial?: PatientDto;
  partners: PartnerDto[];
  onSubmit: (values: PatientFormValues) => Promise<void>;
}

const toFormValues = (initial?: PatientDto): PatientFormValues => {
  if (!initial) {
    return {
      fullName: '',
      email: '',
      phone: '',
      cpf: '',
      birthDate: '',
      notes: '',
      referredByPartnerId: '',
    };
  }
  return {
    fullName: initial.fullName,
    email: initial.email ?? '',
    phone: initial.phone,
    cpf: '',
    birthDate: initial.birthDate ? initial.birthDate.slice(0, 10) : '',
    notes: initial.notes ?? '',
    referredByPartnerId: initial.referredByPartnerId ?? '',
  };
};

export function PatientForm({ initial, partners, onSubmit }: PatientFormProps) {
  const [values, setValues] = useState<PatientFormValues>(() =>
    toFormValues(initial),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (field: keyof PatientFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const phoneChanged = values.phone.trim() !== initial?.phone;
    const phoneCheck = parseBrazilianPhone(values.phone);
    if (phoneChanged && !phoneCheck.ok) {
      setError(phoneCheck.reason);
      return;
    }
    try {
      normalizeOptionalCpf(values.cpf);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CPF inválido');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar paciente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Nome completo *
        <Input
          required
          value={values.fullName}
          onChange={(e) => set('fullName')(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Email (opcional)
        <Input
          type="email"
          value={values.email}
          onChange={(e) => set('email')(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Telefone *
        <Input
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-0000"
          value={values.phone}
          onChange={(e) => set('phone')(e.target.value)}
          className="mt-1"
        />
        <span className="mt-1 block font-normal text-ink-3 text-xs">
          {initial?.phoneNeedsCorrection
            ? 'Telefone fora do padrão: informe DDD + número para corrigir.'
            : 'DDD + número. Guardamos no formato internacional (+55).'}
        </span>
      </label>
      <label className="font-medium text-sm">
        CPF
        <Input
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          value={values.cpf}
          onChange={(e) => set('cpf')(e.target.value)}
          className="mt-1"
        />
        <span className="mt-1 block font-normal text-ink-3 text-xs">
          {initial?.cpfMasked
            ? `CPF cadastrado: ${initial.cpfMasked}. Deixe em branco para manter, ou digite outro para trocar.`
            : 'Opcional. Necessário para emitir recibo (IRPF). Guardado cifrado.'}
        </span>
      </label>
      <label className="font-medium text-sm">
        Data de nascimento
        <Input
          type="date"
          value={values.birthDate}
          onChange={(e) => set('birthDate')(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Indicado por (médico parceiro)
        <NativeSelect
          value={values.referredByPartnerId}
          onChange={(e) => set('referredByPartnerId')(e.target.value)}
          className="mt-1"
        >
          <option value="">Sem indicação</option>
          {partners
            .filter((p) => p.active)
            .map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.fullName}
                {partner.specialty ? ` — ${partner.specialty}` : ''}
              </option>
            ))}
        </NativeSelect>
      </label>
      <label className="font-medium text-sm">
        Observações clínicas
        <Textarea
          rows={3}
          value={values.notes}
          onChange={(e) => set('notes')(e.target.value)}
          className="mt-1"
        />
      </label>
      <Button type="submit" disabled={saving} variant="accent" className="mt-2">
        {saving ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  );
}
