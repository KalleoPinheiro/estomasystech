'use client';

import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';
import type { TriagePhotoDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';

export type TriageDecision = 'reviewed' | 'escalated';

export interface UseTriageQueueResult {
  queue: TriagePhotoDto[] | null;
  queryError: string | null;
  isLoading: boolean;
  actionError: string | null;
  submittingId: string | null;
  refresh: () => void;
  triage: (photo: TriagePhotoDto, decision: TriageDecision) => Promise<void>;
}

/**
 * Fila de triagem (O4.2): fotos enviadas por pacientes entre consultas.
 * Compartilhado entre o resumo no dashboard e a página dedicada (`/triagem`,
 * issue #135) — mesma busca, mesma ação de decisão clínica, um só lugar pra
 * corrigir se o contrato da API mudar.
 */
export function useTriageQueue(): UseTriageQueueResult {
  const {
    data: queue,
    error: queryError,
    isLoading,
    refresh,
  } = useApiQuery<TriagePhotoDto[]>('/api/photos/triage');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { toast } = useToast();

  const triage = async (photo: TriagePhotoDto, decision: TriageDecision) => {
    setSubmittingId(photo.id);
    try {
      await apiFetch(`/api/photos/${photo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ triage: decision }),
      });
      toast({
        description:
          decision === 'reviewed' ? 'Foto revisada' : 'Foto escalada',
        variant: 'success',
      });
      setActionError(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro na triagem');
    } finally {
      setSubmittingId(null);
    }
  };

  return {
    queue,
    queryError,
    isLoading,
    actionError,
    submittingId,
    refresh,
    triage,
  };
}
