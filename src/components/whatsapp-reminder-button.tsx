'use client';

import { Button } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import type { ReminderKind } from '@/domain/messaging/reminder-log';
import { apiFetch } from '@/lib/client';
import { formatTime } from '@/lib/format';

interface WhatsAppReminderButtonProps {
  kind: ReminderKind;
  referenceId: string;
  /** Primeiro clique de hoje (ISO), vindo do GET da rota; `null` sem clique. */
  sentAt: string | null;
  className?: string;
}

/**
 * "Enviar WhatsApp": registra o clique e abre o `wa.me` com a mensagem pronta
 * no WhatsApp da própria clínica. Continua clicável depois do envio; o
 * "enviado hoje às HH:MM" evita que outra recepcionista mande em dobro.
 */
export function WhatsAppReminderButton({
  kind,
  referenceId,
  sentAt,
  className,
}: WhatsAppReminderButtonProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [clickedAt, setClickedAt] = useState<string | null>(null);
  const shownAt = sentAt ?? clickedAt;

  const send = async () => {
    setBusy(true);
    try {
      const result = await apiFetch<{ url: string; sentAt: string }>(
        '/api/reminders/whatsapp-link',
        { method: 'POST', body: JSON.stringify({ kind, referenceId }) },
      );
      window.open(result.url, '_blank', 'noopener,noreferrer');
      setClickedAt(result.sentAt);
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : 'Erro ao preparar o WhatsApp',
        variant: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <Button
        type="button"
        variant="link"
        disabled={busy}
        onClick={() => void send()}
        className={className ?? 'h-auto min-h-11 shrink-0 p-0'}
      >
        Enviar WhatsApp
      </Button>
      {shownAt && (
        <span className="text-ink-3 text-xs" data-whatsapp-sent>
          enviado hoje às {formatTime(shownAt)}
        </span>
      )}
    </span>
  );
}
