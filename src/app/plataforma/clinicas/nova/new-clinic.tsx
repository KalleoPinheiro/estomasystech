'use client';

import {
  Button,
  Card,
  Icon,
  Input,
  RadioGroup,
  RadioGroupItem,
} from '@still-void/ui/react';
import Link from 'next/link';
import { useState } from 'react';
import { AccessLinkField } from '@/components/access-link';
import {
  type ClinicFieldsDraft,
  ClinicFieldsGrid,
  REQUIRED_CLINIC_FIELDS,
  REQUIRED_INDIVIDUAL_FIELDS,
  requiredClinicFieldKeys,
} from '@/components/clinic-fields';
import { ErrorAlert } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { SafeForm } from '@/components/safe-form';
import { apiFetch } from '@/lib/client';
import type { PlatformClinicDto } from '@/lib/dto';

const NEW_CLINIC_FIELDS = [
  ...REQUIRED_CLINIC_FIELDS,
  'professionalName',
  'professionalRegistry',
] as const;

/** Autônoma (#977): CPF e COREN; a responsável técnica é ela mesma. */
const NEW_INDIVIDUAL_FIELDS = [
  ...REQUIRED_INDIVIDUAL_FIELDS,
  'professionalRegistry',
] as const;

type ClientKind = 'company' | 'individual';

const CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  company: 'Clínica (pessoa jurídica)',
  individual: 'Profissional autônoma (pessoa física)',
};

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
  admin: { email: string; delivered: boolean; inviteUrl: string | null };
}

/**
 * Nova clínica (B4, Journey 3): nome, CNPJ, contato e e-mail do primeiro admin
 * obrigatórios; responsável técnico opcional. A clínica nova ainda não tem
 * canal de e-mail, então o convite nunca sai por e-mail: a tela mostra o link
 * para o super admin repassar ao admin (C2, #265).
 */
export function NewClinic() {
  const [created, setCreated] = useState<CreatedClinic | null>(null);
  if (created) return <CreatedClinicResult created={created} />;
  return <NewClinicForm onCreated={setCreated} />;
}

function BackToClinics() {
  return (
    <Link
      href="/plataforma"
      className="inline-flex items-center gap-1 text-accent-ink text-sm hover:underline"
    >
      <Icon name="chevron-left" /> Clínicas
    </Link>
  );
}

function CreatedClinicResult({ created }: { created: CreatedClinic }) {
  return (
    <>
      <PageHeader
        leading={<BackToClinics />}
        title="Clínica criada"
        description={`${created.clinic.name} foi criada. Repasse o convite ao primeiro admin, ${created.admin.email}.`}
      />
      <Card as="section" className="flex flex-col gap-4 p-5">
        {created.admin.inviteUrl && (
          <AccessLinkField
            url={created.admin.inviteUrl}
            label="Link de convite do primeiro admin"
          />
        )}
        <p className="text-ink-3 text-sm">
          Envie este link ao administrador da clínica. Ele vale por 24 horas e
          só pode ser usado uma vez.
        </p>
        <div>
          <Link
            href={`/plataforma/clinicas/${created.clinic.id}`}
            className="text-accent-ink text-sm hover:underline"
          >
            Abrir a clínica
          </Link>
        </div>
      </Card>
    </>
  );
}

function NewClinicForm({
  onCreated,
}: {
  onCreated: (created: CreatedClinic) => void;
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const kind: ClientKind =
    draft.kind === 'individual' ? 'individual' : 'company';
  // Trocar o tipo limpa o documento do outro: a autônoma nunca envia CNPJ, e a
  // clínica, nem `kind` nem CPF (o corpo da clínica é o anterior à #977).
  const chooseKind = (next: ClientKind) =>
    setDraft(({ kind: _kind, cpf: _cpf, ...rest }) =>
      next === 'individual'
        ? { ...rest, kind: 'individual', cnpj: null, cpf: '' }
        : { ...rest, cnpj: '' },
    );
  const [adminEmail, setAdminEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onCreated(
        await apiFetch<CreatedClinic>('/api/platform/clinics', {
          method: 'POST',
          body: JSON.stringify({ ...draft, adminEmail }),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar clínica');
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        leading={<BackToClinics />}
        title="Nova clínica"
        description="Ao criar, você recebe o link de convite do primeiro Admin de Empresa para repassar a ele."
      />
      <Card as="section" className="p-5">
        <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <ErrorAlert message={error} />}
          <RadioGroup
            legend="Tipo de cliente"
            name="client-kind"
            orientation="horizontal"
          >
            {(['company', 'individual'] as const).map((option) => (
              <RadioGroupItem
                key={option}
                value={option}
                checked={kind === option}
                onChange={() => chooseKind(option)}
              >
                {CLIENT_KIND_LABELS[option]}
              </RadioGroupItem>
            ))}
          </RadioGroup>
          <ClinicFieldsGrid
            draft={draft}
            keys={
              kind === 'individual' ? NEW_INDIVIDUAL_FIELDS : NEW_CLINIC_FIELDS
            }
            required={requiredClinicFieldKeys(draft)}
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
        </SafeForm>
      </Card>
    </>
  );
}
