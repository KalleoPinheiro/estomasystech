'use client';

import { Button, Input } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { SafeForm } from '@/components/safe-form';
import { unwrapAction } from '@/lib/action-result';
import type { PartnerDto } from '@/lib/dto';
import { createPartner, updatePartner } from './partner-actions';

interface PartnerFormValues {
  fullName: string;
  email: string;
  phone: string;
  crm: string;
  specialty: string;
}

const toFormValues = (initial?: PartnerDto): PartnerFormValues => {
  if (!initial) {
    return { fullName: '', email: '', phone: '', crm: '', specialty: '' };
  }
  return {
    fullName: initial.fullName,
    email: initial.email,
    phone: initial.phone,
    crm: initial.crm ?? '',
    specialty: initial.specialty ?? '',
  };
};

export function PartnerForm({
  initial,
  onSaved,
}: {
  initial?: PartnerDto;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<PartnerFormValues>(() =>
    toFormValues(initial),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (field: keyof PartnerFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        crm: values.crm || null,
        specialty: values.specialty || null,
      };
      await unwrapAction(
        initial
          ? updatePartner({ id: initial.id, ...payload })
          : createPartner(payload),
      );
      toast({
        description: 'Parceiro salvo',
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar parceiro');
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
        Email *
        <Input
          required
          type="email"
          value={values.email}
          onChange={(e) => set('email')(e.target.value)}
          className="mt-1"
        />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="font-medium text-sm">
          Telefone *
          <Input
            required
            value={values.phone}
            onChange={(e) => set('phone')(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          CRM
          <Input
            value={values.crm}
            onChange={(e) => set('crm')(e.target.value)}
            placeholder="Ex.: CRM-SP 123456"
            className="mt-1"
          />
        </label>
      </div>
      <label className="font-medium text-sm">
        Especialidade
        <Input
          value={values.specialty}
          onChange={(e) => set('specialty')(e.target.value)}
          placeholder="Ex.: Cirurgia vascular"
          className="mt-1"
        />
      </label>
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Salvando…' : 'Salvar'}
      </Button>
    </SafeForm>
  );
}
