'use client';

import {
  Button,
  Card,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { Modal } from '@/components/modal';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/client';
import type { PartnerDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';

export default function PartnersPage() {
  const { toast } = useToast();
  const {
    data: partners,
    error,
    refresh,
  } = useApiQuery<PartnerDto[]>('/api/partners');
  const [editing, setEditing] = useState<PartnerDto | 'new' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleActive = async (partner: PartnerDto) => {
    try {
      await apiFetch<PartnerDto>(`/api/partners/${partner.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !partner.active }),
      });
      toast({
        description: partner.active
          ? 'Parceiro desativado'
          : 'Parceiro ativado',
        variant: 'success',
      });
      setActionError(null);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao atualizar parceiro',
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Parceiros"
        description="Parceiros indicam pacientes e acompanham a evolução das suas indicações pelo portal, entrando com a conta Google do email cadastrado aqui."
        actions={
          <Button
            type="button"
            onClick={() => setEditing('new')}
            variant="accent"
          >
            + Novo parceiro
          </Button>
        }
      />

      {(actionError ?? error) && (
        <ErrorAlert message={actionError ?? error ?? ''} />
      )}

      <Card>
        {!partners ? (
          <LoadingIndicator />
        ) : partners.length === 0 ? (
          <EmptyState message="Nenhum parceiro cadastrado." icon="info" />
        ) : (
          <div className="overflow-x-auto">
            <Table stack className="w-full text-left text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 py-3">Nome</TableHead>
                  <TableHead className="px-4 py-3">Contato</TableHead>
                  <TableHead className="px-4 py-3">CRM</TableHead>
                  <TableHead className="px-4 py-3">Especialidade</TableHead>
                  <TableHead className="px-4 py-3">Situação</TableHead>
                  <TableHead className="px-4 py-3 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner) => (
                  <TableRow
                    key={partner.id}
                    className={partner.active ? '' : 'bg-surface-2/60'}
                  >
                    <TableCell label="Nome" className="px-4 py-3 font-medium">
                      {partner.fullName}
                    </TableCell>
                    <TableCell label="Contato" className="px-4 py-3 text-ink-2">
                      <div>
                        <a
                          href={`mailto:${partner.email}`}
                          className="hover:underline"
                        >
                          {partner.email}
                        </a>
                      </div>
                      <div className="text-ink-3 text-xs">
                        <a
                          href={`tel:${partner.phone}`}
                          className="hover:underline"
                        >
                          {partner.phone}
                        </a>
                      </div>
                    </TableCell>
                    <TableCell label="CRM" className="px-4 py-3 text-ink-2">
                      {partner.crm ?? '—'}
                    </TableCell>
                    <TableCell
                      label="Especialidade"
                      className="px-4 py-3 text-ink-2"
                    >
                      {partner.specialty ?? '—'}
                    </TableCell>
                    <TableCell label="Situação" className="px-4 py-3">
                      <StatusBadge
                        status={partner.active ? 'confirmed' : 'cancelled'}
                        label={partner.active ? 'Ativo' : 'Inativo'}
                      />
                    </TableCell>
                    <TableCell label="Ações" className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        onClick={() => setEditing(partner)}
                        variant="ghost"
                        size="sm"
                      >
                        Editar
                      </Button>
                      {partner.active ? (
                        <ConfirmAction
                          trigger={
                            <Button type="button" variant="ghost" size="sm">
                              Desativar
                            </Button>
                          }
                          title="Desativar parceiro?"
                          description="O parceiro para de aparecer nos fluxos ativos. Pacientes indicados por ele podem perder a referência na próxima edição do cadastro."
                          confirmLabel="Confirmar"
                          variant="danger"
                          onConfirm={() => toggleActive(partner)}
                        />
                      ) : (
                        <Button
                          type="button"
                          onClick={() => void toggleActive(partner)}
                          variant="ghost"
                          size="sm"
                        >
                          Reativar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {editing && (
        <Modal
          title={editing === 'new' ? 'Novo parceiro' : 'Editar parceiro'}
          onClose={() => setEditing(null)}
        >
          <PartnerForm
            initial={editing === 'new' ? undefined : editing}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}

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

function PartnerForm({
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
      if (initial) {
        await apiFetch<PartnerDto>(`/api/partners/${initial.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch<PartnerDto>('/api/partners', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
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
        Email (usado no login com Google) *
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
    </form>
  );
}
