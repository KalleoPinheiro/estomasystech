'use client';

import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { TriagePhotoList } from '@/components/triage-photo-list';
import type { TriagePhotoDto } from '@/lib/dto';
import type { TriageDecision } from '@/lib/use-triage-queue';
import { decideTriage } from '../hoje-actions';

/**
 * Fila de triagem do resumo da tela Hoje: a lista vem do servidor e a decisão
 * clínica (revisada ou escalada) é a Server Action `decideTriage`, com
 * auditoria na mesma transação e `refresh()` da tela.
 */
export function TriageActions({ queue }: { queue: TriagePhotoDto[] }) {
  const { toast } = useToast();
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const triage = async (photo: TriagePhotoDto, decision: TriageDecision) => {
    setSubmittingId(photo.id);
    try {
      const result = await decideTriage({ id: photo.id, decision });
      if (result.success) {
        toast({
          description:
            decision === 'reviewed' ? 'Foto revisada' : 'Foto escalada',
          variant: 'success',
        });
        setActionError(null);
      } else {
        setActionError(result.error);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro na triagem');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <TriagePhotoList
      queue={queue}
      actionError={actionError}
      submittingId={submittingId}
      onTriage={triage}
    />
  );
}
