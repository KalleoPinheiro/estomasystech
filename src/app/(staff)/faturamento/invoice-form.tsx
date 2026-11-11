'use client';

import { Button, Input } from '@still-void/ui/react';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { PatientPicker } from '@/components/patient-picker';
import { SafeForm } from '@/components/safe-form';

export interface InvoiceFormValues {
  patientId: string;
  description: string;
  amount: string;
  dueDate: string;
}

interface InvoiceFormProps {
  onSubmit: (values: InvoiceFormValues) => Promise<void>;
}

export function InvoiceForm({ onSubmit }: InvoiceFormProps) {
  const [values, setValues] = useState<InvoiceFormValues>({
    patientId: '',
    description: '',
    amount: '',
    dueDate: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!values.patientId) {
      setError('Selecione o paciente');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao emitir fatura');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <PatientPicker
        label="Paciente *"
        value={values.patientId}
        onChange={(patientId) => setValues((prev) => ({ ...prev, patientId }))}
      />
      <label className="font-medium text-sm">
        Descrição *
        <Input
          required
          value={values.description}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="Ex.: Sessão de curativo especializado"
          className="mt-1"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="font-medium text-sm">
          Valor (R$) *
          <Input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={values.amount}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, amount: e.target.value }))
            }
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Vencimento
          <Input
            type="date"
            value={values.dueDate}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, dueDate: e.target.value }))
            }
            className="mt-1"
          />
        </label>
      </div>
      <Button type="submit" disabled={saving} variant="accent" className="mt-2">
        {saving ? 'Emitindo…' : 'Emitir fatura'}
      </Button>
    </SafeForm>
  );
}
