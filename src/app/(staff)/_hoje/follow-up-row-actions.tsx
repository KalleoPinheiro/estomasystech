'use client';

import { Button, Icon } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import Link from 'next/link';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { WhatsAppReminderButton } from '@/components/whatsapp-reminder-button';
import type { FollowUpDto } from '@/lib/dto';
import { formatDate } from '@/lib/format';
import { resolveFollowUp } from '../hoje-actions';

/**
 * Ações de um retorno pendente: agendar, WhatsApp, concluir e cancelar. Concluir
 * e cancelar são a Server Action `resolveFollowUp` (guarda, auditoria na mesma
 * transação e `refresh()` da tela); o resto da linha vem do servidor.
 */
export function FollowUpRowActions({
  followUp,
  whatsappSentAt,
}: {
  followUp: FollowUpDto;
  whatsappSentAt: string | null;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const resolve = async (status: 'done' | 'cancelled') => {
    setSubmitting(true);
    try {
      const result = await resolveFollowUp({ id: followUp.id, status });
      toast(
        result.success
          ? {
              description:
                status === 'done' ? 'Retorno concluído' : 'Retorno cancelado',
              variant: 'success',
            }
          : { description: result.error, variant: 'danger' },
      );
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : 'Erro ao atualizar retorno',
        variant: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3" data-follow-up-actions>
      <span
        className={`shrink-0 font-medium text-xs ${
          followUp.isOverdue ? 'text-danger' : 'text-ink-3'
        }`}
      >
        {followUp.isOverdue ? (
          <>
            <Icon name="alert-triangle" /> Atrasado —{' '}
          </>
        ) : null}
        {formatDate(followUp.dueDate)}
      </span>
      <Link
        href={`/agenda?followUpId=${followUp.id}&patientId=${followUp.patientId}&procedure=${encodeURIComponent(followUp.reason.replace(/^Retorno: /, ''))}`}
        className="flex min-h-11 shrink-0 items-center font-medium text-accent-ink hover:underline"
      >
        Agendar
      </Link>
      <WhatsAppReminderButton
        kind="recall"
        referenceId={followUp.id}
        sentAt={whatsappSentAt}
      />
      <Button
        type="button"
        onClick={() => void resolve('done')}
        variant="link"
        disabled={submitting}
        className="h-auto min-h-11 min-w-11 shrink-0 p-0 text-success"
      >
        {submitting ? 'Enviando…' : 'Concluir'}
      </Button>
      <ConfirmAction
        trigger={
          <Button
            type="button"
            variant="link"
            disabled={submitting}
            className="h-auto min-h-11 min-w-11 shrink-0 p-0 text-ink-3"
          >
            Cancelar
          </Button>
        }
        title="Cancelar retorno?"
        description="O retorno agendado será cancelado e o paciente não será mais lembrado."
        confirmLabel="Cancelar retorno"
        variant="danger"
        onConfirm={() => resolve('cancelled')}
      />
    </div>
  );
}
