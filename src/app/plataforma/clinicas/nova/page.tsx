'use client';

import { Button, Card, Icon, Input } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  type ClinicFieldsDraft,
  ClinicFieldsGrid,
  REQUIRED_CLINIC_FIELDS,
} from '@/components/clinic-fields';
import { ErrorAlert } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { apiFetch } from '@/lib/client';
import type { PlatformClinicDto } from '@/lib/dto';

const NEW_CLINIC_FIELDS = [
  ...REQUIRED_CLINIC_FIELDS,
  'professionalName',
  'professionalRegistry',
] as const;

const EMPTY_DRAFT: ClinicFieldsDraft = {
  name: '',
  cnpj: '',
  contactPhone: '',
  contactEmail: '',
  professionalName: '',
  professionalRegistry: '',
};

interface CreatedClinic {
  clinic: PlatformClinicDto;
  admin: { email: string; delivered: boolean };
}

/**
 * Nova clínica (B4, Journey 3): nome, CNPJ, contato e e-mail do primeiro admin
 * obrigatórios; responsável técnico opcional. Ao salvar, o admin recebe o
 * convite e a tela abre o detalhe da clínica.
 */
export default function NewClinicPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [adminEmail, setAdminEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<CreatedClinic>('/api/platform/clinics', {
        method: 'POST',
        body: JSON.stringify({ ...draft, adminEmail }),
      });
      toast({
        description: created.admin.delivered
          ? `Clínica criada. Convite enviado para ${created.admin.email}.`
          : `Clínica criada, mas o convite para ${created.admin.email} não foi entregue. Reenvie pelo detalhe da clínica.`,
        variant: created.admin.delivered ? 'success' : 'warning',
      });
      router.push(`/plataforma/clinicas/${created.clinic.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar clínica');
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        leading={
          <Link
            href="/plataforma"
            className="inline-flex items-center gap-1 text-accent-ink text-sm hover:underline"
          >
            <Icon name="chevron-left" /> Clínicas
          </Link>
        }
        title="Nova clínica"
        description="O primeiro Admin de Empresa recebe um convite por e-mail e define a própria senha."
      />
      <Card as="section" className="p-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <ErrorAlert message={error} />}
          <ClinicFieldsGrid
            draft={draft}
            keys={NEW_CLINIC_FIELDS}
            required={REQUIRED_CLINIC_FIELDS}
            onChange={setDraft}
          />
          <label className="max-w-xl font-medium text-sm">
            E-mail do primeiro admin *
            <Input
              type="email"
              required
              value={adminEmail}
              placeholder="admin@clinica.com.br"
              onChange={(e) => setAdminEmail(e.target.value)}
              className="mt-1"
            />
          </label>
          <div>
            <Button type="submit" variant="accent" disabled={saving}>
              {saving ? 'Criando…' : 'Criar clínica e convidar admin'}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
