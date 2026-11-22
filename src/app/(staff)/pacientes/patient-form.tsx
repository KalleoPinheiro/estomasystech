'use client';

import { Button, Input, NativeSelect, Textarea } from '@still-void/ui/react';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import {
  type DuplicateLookup,
  duplicateLookupBody,
  PossibleDuplicatesNotice,
  useDuplicateCheck,
} from '@/components/possible-duplicates-notice';
import { SafeForm } from '@/components/safe-form';
import {
  FUTURE_BIRTH_DATE,
  isFutureBirthDate,
} from '@/domain/patient/possible-duplicates';
import { normalizeOptionalCpf } from '@/domain/shared/cpf';
import { parseBrazilianPhone } from '@/domain/shared/phone';
import { zonedDateKey } from '@/domain/shared/time-zone';
import type { PartnerDto, PatientDto } from '@/lib/dto';
import { findPossibleDuplicatePatients } from './actions';

/** Conferência pela Server Action, a mesma via do cadastro completo (#992). */
const lookupByAction: DuplicateLookup = async (values) => {
  const result = await findPossibleDuplicatePatients(
    duplicateLookupBody(values),
  );
  return result.success ? result.data : [];
};

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
  /** Cadastro novo: confere repetidos e leva à ficha do escolhido (#992). */
  existingPatientHref?: (patient: PatientDto) => string;
}

type FieldErrors = Partial<Record<'phone' | 'cpf' | 'birthDate', string>>;

/** Todos os erros de uma vez, com o campo marcado (#478). */
function collectFieldErrors(
  values: PatientFormValues,
  initial?: PatientDto,
): FieldErrors {
  const found: FieldErrors = {};
  const phoneChanged = values.phone.trim() !== initial?.phone;
  const phoneCheck = parseBrazilianPhone(values.phone);
  if (phoneChanged && !phoneCheck.ok) {
    found.phone = phoneCheck.reason;
  }
  try {
    normalizeOptionalCpf(values.cpf);
  } catch (err) {
    found.cpf = err instanceof Error ? err.message : 'CPF inválido';
  }
  if (values.birthDate && isFutureBirthDate(new Date(values.birthDate))) {
    found.birthDate = FUTURE_BIRTH_DATE;
  }
  return found;
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

export function PatientForm({
  initial,
  partners,
  onSubmit,
  existingPatientHref,
}: PatientFormProps) {
  const [values, setValues] = useState<PatientFormValues>(() =>
    toFormValues(initial),
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  // Só o cadastro novo confere repetidos (#992); mudar um campo confere de novo.
  const duplicateCheck = useDuplicateCheck(
    !initial && !!existingPatientHref,
    lookupByAction,
  );

  const set = (field: keyof PatientFormValues) => (value: string) => {
    duplicateCheck.reset();
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = collectFieldErrors(values, initial);
    setFieldErrors(found);
    const messages = Object.values(found);
    if (messages.length > 0) {
      setError(messages.join(' '));
      return;
    }
    setError(null);
    setSaving(true);
    if (await duplicateCheck.check(values)) {
      setSaving(false);
      return;
    }
    await save();
  };

  const save = async () => {
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
    <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
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
          aria-invalid={fieldErrors.phone ? true : undefined}
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
          aria-invalid={fieldErrors.cpf ? true : undefined}
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
          max={zonedDateKey(new Date())}
          aria-invalid={fieldErrors.birthDate ? true : undefined}
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
      {duplicateCheck.duplicates.length > 0 ? (
        <PossibleDuplicatesNotice
          duplicates={duplicateCheck.duplicates}
          hrefFor={existingPatientHref}
          onCreateAnyway={() => void save()}
          busy={saving}
        />
      ) : null}
      <Button type="submit" disabled={saving} variant="accent" className="mt-2">
        {saving ? 'Salvando…' : 'Salvar'}
      </Button>
    </SafeForm>
  );
}
