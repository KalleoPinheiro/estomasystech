'use client';

import {
  Button,
  Card,
  Input,
  NativeSelect,
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
import type { CommissionType } from '@/domain/professional/professional';
import { apiFetch } from '@/lib/client';
import type { ProfessionalDto } from '@/lib/dto';
import { formatCommissionRule } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import { AvailabilityForm } from './availability-form';

/** Regra vigente a partir do DTO — mesma leitura de `Professional.commissionRule`. */
function ruleOf(professional: ProfessionalDto) {
  if (professional.commissionType === 'fixed') {
    return professional.commissionFixedCents != null
      ? {
          kind: 'fixed' as const,
          centsPerSession: professional.commissionFixedCents,
        }
      : null;
  }
  return professional.commissionPct != null
    ? { kind: 'percentage' as const, pct: professional.commissionPct }
    : null;
}

export default function ProfessionalsPage() {
  const { toast } = useToast();
  const {
    data: professionals,
    error,
    refresh,
  } = useApiQuery<ProfessionalDto[]>('/api/professionals');
  const [editing, setEditing] = useState<ProfessionalDto | 'new' | null>(null);
  const [editingHours, setEditingHours] = useState<ProfessionalDto | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleActive = async (professional: ProfessionalDto) => {
    try {
      await apiFetch(`/api/professionals/${professional.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !professional.active }),
      });
      toast({
        description: professional.active
          ? 'Profissional desativado'
          : 'Profissional ativado',
        variant: 'success',
      });
      setActionError(null);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao atualizar profissional',
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Profissionais"
        actions={
          <Button
            type="button"
            onClick={() => setEditing('new')}
            variant="accent"
          >
            + Novo profissional
          </Button>
        }
      />

      {(error || actionError) && (
        <ErrorAlert message={actionError ?? error ?? ''} />
      )}

      <Card>
        {!professionals ? (
          <LoadingIndicator />
        ) : professionals.length === 0 ? (
          <EmptyState message="Nenhum profissional cadastrado. Consultas e evoluções podem ser atribuídas após o cadastro." />
        ) : (
          <div className="overflow-x-auto">
            <Table stack className="w-full text-left text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 py-3">Nome</TableHead>
                  <TableHead className="px-4 py-3">Registro</TableHead>
                  <TableHead className="px-4 py-3">Repasse</TableHead>
                  <TableHead className="px-4 py-3">Situação</TableHead>
                  <TableHead className="px-4 py-3 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {professionals.map((professional) => (
                  <TableRow
                    key={professional.id}
                    className={professional.active ? '' : 'bg-surface-2/60'}
                  >
                    <TableCell label="Nome" className="px-4 py-3 font-medium">
                      {professional.fullName}
                    </TableCell>
                    <TableCell
                      label="Registro"
                      className="px-4 py-3 text-ink-2"
                    >
                      {professional.registry ?? '—'}
                    </TableCell>
                    <TableCell label="Repasse" className="px-4 py-3 text-ink-2">
                      {formatCommissionRule(ruleOf(professional))}
                    </TableCell>
                    <TableCell label="Situação" className="px-4 py-3">
                      <StatusBadge
                        status={professional.active ? 'confirmed' : 'cancelled'}
                        label={professional.active ? 'Ativo' : 'Inativo'}
                      />
                    </TableCell>
                    <TableCell label="Ações" className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        onClick={() => setEditing(professional)}
                        variant="ghost"
                        size="sm"
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setEditingHours(professional)}
                        variant="ghost"
                        size="sm"
                      >
                        Horários
                      </Button>
                      {professional.active ? (
                        <ConfirmAction
                          trigger={
                            <Button type="button" variant="ghost" size="sm">
                              Desativar
                            </Button>
                          }
                          title="Desativar profissional?"
                          description="O profissional para de estar disponível pra agendar."
                          confirmLabel="Confirmar"
                          variant="danger"
                          onConfirm={() => toggleActive(professional)}
                        />
                      ) : (
                        <Button
                          type="button"
                          onClick={() => void toggleActive(professional)}
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

      {editingHours && (
        <Modal
          title={`Horários — ${editingHours.fullName}`}
          onClose={() => setEditingHours(null)}
        >
          <AvailabilityForm
            professional={editingHours}
            onDone={() => setEditingHours(null)}
          />
        </Modal>
      )}

      {editing && (
        <Modal
          title={
            editing === 'new' ? 'Novo profissional' : 'Editar profissional'
          }
          onClose={() => setEditing(null)}
        >
          <ProfessionalForm
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

function ProfessionalForm({
  initial,
  onSaved,
}: {
  initial?: ProfessionalDto;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [registry, setRegistry] = useState(initial?.registry ?? '');
  const [commissionType, setCommissionType] = useState<CommissionType>(
    initial?.commissionType ?? 'percentage',
  );
  const [commissionPct, setCommissionPct] = useState(
    initial?.commissionPct != null ? String(initial.commissionPct) : '',
  );
  const [commissionFixed, setCommissionFixed] = useState(
    initial?.commissionFixedCents != null
      ? String(initial.commissionFixedCents / 100)
      : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        fullName,
        registry: registry || null,
        commissionType,
        commissionPct: commissionPct ? Number(commissionPct) : null,
        commissionFixedCents: commissionFixed
          ? Math.round(Number(commissionFixed) * 100)
          : null,
      };
      if (initial) {
        await apiFetch(`/api/professionals/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/professionals', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      toast({
        description: 'Profissional salvo',
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar profissional',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Nome *
        <Input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Registro profissional
        <Input
          value={registry}
          onChange={(e) => setRegistry(e.target.value)}
          placeholder="Ex.: COREN-SP 123456"
          className="mt-1"
        />
        <span className="mt-1 block font-normal text-ink-3 text-xs">
          Ex.: COREN-SP 123456
        </span>
      </label>
      <label className="font-medium text-sm">
        Tipo de repasse
        <NativeSelect
          value={commissionType}
          onChange={(e) => setCommissionType(e.target.value as CommissionType)}
          className="mt-1"
        >
          <option value="percentage">Percentual da sessão</option>
          <option value="fixed">Valor fixo por sessão</option>
        </NativeSelect>
      </label>
      {commissionType === 'percentage' ? (
        <label className="font-medium text-sm">
          Repasse (%)
          <Input
            type="number"
            min="0"
            max="100"
            value={commissionPct}
            onChange={(e) => setCommissionPct(e.target.value)}
            placeholder="Ex.: 15"
            className="mt-1"
          />
          <span className="mt-1 block font-normal text-ink-3 text-xs">
            Percentual sobre o valor de cada sessão realizada (sessão de pacote
            vale o preço do pacote dividido pelas sessões).
          </span>
        </label>
      ) : (
        <label className="font-medium text-sm">
          Valor por sessão (R$)
          <Input
            type="number"
            min="0"
            step="0.01"
            required
            value={commissionFixed}
            onChange={(e) => setCommissionFixed(e.target.value)}
            placeholder="Ex.: 50,00"
            className="mt-1"
          />
          <span className="mt-1 block font-normal text-ink-3 text-xs">
            Valor fixo repassado por sessão realizada, qualquer que seja o
            preço.
          </span>
        </label>
      )}
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  );
}
