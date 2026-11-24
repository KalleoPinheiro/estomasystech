'use client';

import { Button, Card, Input } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { SafeForm } from '@/components/safe-form';
import { apiFetch } from '@/lib/client';

/**
 * Autônoma que abriu CNPJ (#986): o Admin troca o cadastro para clínica. Os
 * documentos novos saem com o CNPJ; pacientes, agenda e financeiro ficam.
 */
export function ConvertToCompanySection({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [cnpj, setCnpj] = useState('');
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convert = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/settings/clinic-info/cnpj', {
        method: 'POST',
        body: JSON.stringify({ cnpj, name: name.trim() || null }),
      });
      toast({ description: 'Cadastro passou para CNPJ', variant: 'success' });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao trocar para CNPJ');
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (confirming) {
      void convert();
      return;
    }
    setConfirming(true);
  };

  return (
    <Card as="section" className="mt-4 p-5">
      <h2 className="mb-1 font-semibold text-lg">Abriu CNPJ?</h2>
      <p className="mb-4 text-ink-3 text-sm">
        Troque o CPF pelo CNPJ: os próximos documentos saem com o CNPJ, e
        pacientes, agenda e financeiro continuam como estão. O CPF sai do
        cadastro.
      </p>
      {error && <ErrorAlert message={error} />}
      {!open && (
        <Button type="button" onClick={() => setOpen(true)}>
          Trocar CPF por CNPJ
        </Button>
      )}
      {open && (
        <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="font-medium text-sm">
            CNPJ *
            <Input
              required
              inputMode="numeric"
              value={cnpj}
              onChange={(e) => {
                setCnpj(e.target.value);
                setConfirming(false);
              }}
              className="mt-1"
            />
          </label>
          <label className="font-medium text-sm">
            Razão social (opcional; vazio mantém o nome atual)
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setConfirming(false);
              }}
              className="mt-1"
            />
          </label>
          {confirming && (
            <p className="font-medium text-sm">
              Confirma a troca? Ela não volta para CPF por aqui.
            </p>
          )}
          <Button
            type="submit"
            disabled={saving}
            variant="accent"
            className="self-start"
          >
            {saving
              ? 'Trocando…'
              : confirming
                ? 'Confirmar troca para CNPJ'
                : 'Continuar'}
          </Button>
        </SafeForm>
      )}
    </Card>
  );
}
