'use client';

import { Button, Textarea } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { unwrapAction } from '@/lib/action-result';
import { resolveDataRequest } from './data-request-actions';

/**
 * Decisão do Admin sobre um pedido do titular (#293): aceitar ou recusar,
 * sempre com justificativa que o paciente vê no portal. Server Action com
 * auditoria na mesma transação; a fila se atualiza sozinha (`refresh()` dentro
 * da ação), sem recarregar a lista no cliente.
 */
export function ResolveForm({ requestId }: { requestId: string }) {
  const { toast } = useToast();
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (decision: 'accept' | 'reject') => {
    setSaving(true);
    setError(null);
    try {
      const result = await unwrapAction(
        resolveDataRequest({
          id: requestId,
          decision,
          justification: justification.trim(),
        }),
      );
      toast({
        description: result.notified
          ? 'Decisão registrada e paciente avisado por e-mail'
          : 'Decisão registrada. O e-mail não saiu: a resposta fica no portal do paciente.',
        variant: 'success',
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao registrar a decisão',
      );
    } finally {
      setSaving(false);
    }
  };

  const blocked = saving || !justification.trim();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        Justificativa (o paciente vê no portal)
        <Textarea
          value={justification}
          maxLength={1000}
          rows={2}
          onChange={(event) => setJustification(event.target.value)}
        />
      </label>
      {error && <ErrorAlert message={error} />}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="accent"
          disabled={blocked}
          onClick={() => void resolve('accept')}
        >
          Aceitar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={blocked}
          onClick={() => void resolve('reject')}
        >
          Recusar
        </Button>
      </div>
    </div>
  );
}
