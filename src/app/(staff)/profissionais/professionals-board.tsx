'use client';

import {
  Button,
  Card,
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
import { EmptyState, ErrorAlert } from '@/components/feedback';
import { Modal } from '@/components/modal';
import { SheetPanel } from '@/components/sheet-panel';
import { StatusBadge } from '@/components/status-badge';
import { unwrapAction } from '@/lib/action-result';
import type { ProfessionalDto } from '@/lib/dto';
import { formatCommissionRule } from '@/lib/format';
import { AvailabilityForm } from './availability-form';
import { updateProfessional } from './professional-actions';
import { ProfessionalForm } from './professional-form';

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

/**
 * Lista de profissionais com ficha ao lado, horários e ativar/desativar. Os
 * dados chegam por props (a página os lê no servidor); gravar é Server Action
 * e a tela se atualiza sozinha.
 */
export function ProfessionalsBoard({
  professionals,
}: {
  professionals: ProfessionalDto[];
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<ProfessionalDto | null>(null);
  const [editingHours, setEditingHours] = useState<ProfessionalDto | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleActive = async (professional: ProfessionalDto) => {
    try {
      await unwrapAction(
        updateProfessional({
          id: professional.id,
          active: !professional.active,
        }),
      );
      toast({
        description: professional.active
          ? 'Profissional desativado'
          : 'Profissional ativado',
        variant: 'success',
      });
      setActionError(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao atualizar profissional',
      );
    }
  };

  return (
    <div>
      {actionError && <ErrorAlert message={actionError} />}

      <div
        className={
          editing
            ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'
            : ''
        }
      >
        <Card>
          {professionals.length === 0 ? (
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
                    <TableHead className="px-4 py-3 text-right">
                      Ações
                    </TableHead>
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
                      <TableCell
                        label="Repasse"
                        className="px-4 py-3 text-ink-2"
                      >
                        {formatCommissionRule(ruleOf(professional))}
                      </TableCell>
                      <TableCell label="Situação" className="px-4 py-3">
                        <StatusBadge
                          status={
                            professional.active ? 'confirmed' : 'cancelled'
                          }
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
        {editing && (
          <SheetPanel
            key={editing.id}
            title="Editar profissional"
            onClose={() => setEditing(null)}
          >
            <ProfessionalForm
              initial={editing}
              onSaved={() => {
                setEditing(null);
              }}
            />
          </SheetPanel>
        )}
      </div>

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
    </div>
  );
}
