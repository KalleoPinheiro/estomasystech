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
import { SheetPanel } from '@/components/sheet-panel';
import { StatusBadge } from '@/components/status-badge';
import { displayBrazilianPhone } from '@/domain/shared/phone';
import { unwrapAction } from '@/lib/action-result';
import type { PartnerDto } from '@/lib/dto';
import { updatePartner } from './partner-actions';
import { PartnerForm } from './partner-form';

/**
 * Lista de parceiros com ficha ao lado e ativar/desativar. Os dados chegam por
 * props (a página os lê no servidor); gravar é Server Action e a tela se
 * atualiza sozinha.
 */
export function PartnersBoard({ partners }: { partners: PartnerDto[] }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<PartnerDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleActive = async (partner: PartnerDto) => {
    try {
      await unwrapAction(
        updatePartner({ id: partner.id, active: !partner.active }),
      );
      toast({
        description: partner.active
          ? 'Parceiro desativado'
          : 'Parceiro ativado',
        variant: 'success',
      });
      setActionError(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao atualizar parceiro',
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
          {partners.length === 0 ? (
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
                    <TableHead className="px-4 py-3 text-right">
                      Ações
                    </TableHead>
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
                      <TableCell
                        label="Contato"
                        className="px-4 py-3 text-ink-2"
                      >
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
                            {displayBrazilianPhone(partner.phone)}
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
          <SheetPanel
            key={editing.id}
            title="Editar parceiro"
            onClose={() => setEditing(null)}
          >
            <PartnerForm
              initial={editing}
              onSaved={() => {
                setEditing(null);
              }}
            />
          </SheetPanel>
        )}
      </div>
    </div>
  );
}
