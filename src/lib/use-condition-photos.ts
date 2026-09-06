'use client';

import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { apiFetch } from '@/lib/client';
import type { ConditionPhotoDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface UseConditionPhotosResult {
  photos: ConditionPhotoDto[] | null;
  listError: string | null;
  isLoading: boolean;
  actionError: string | null;
  uploading: boolean;
  refresh: () => void;
  upload: (file: File) => Promise<void>;
  remove: (photo: ConditionPhotoDto) => Promise<void>;
}

/**
 * Fotos de evolução de uma Condition (galeria da ficha do paciente) — mesmo
 * seam de use-triage-queue.ts (useApiQuery + apiFetch) pro mesmo domínio
 * (Condition Photo). Upload usa `fetch` cru: `apiFetch` fixa
 * `Content-Type: application/json`, incompatível com `FormData` (o browser
 * precisa definir o boundary do multipart sozinho).
 */
export function useConditionPhotos(
  conditionId: string,
): UseConditionPhotosResult {
  const {
    data: photos,
    error: listError,
    isLoading,
    refresh,
  } = useApiQuery<ConditionPhotoDto[]>(`/api/conditions/${conditionId}/photos`);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const upload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setActionError('Imagem excede o limite de 5 MB');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`/api/conditions/${conditionId}/photos`, {
        method: 'POST',
        body,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? 'Erro ao enviar foto');
      }
      toast({ description: 'Foto enviada', variant: 'success' });
      setActionError(null);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao enviar foto',
      );
    } finally {
      setUploading(false);
    }
  };

  const remove = async (photo: ConditionPhotoDto) => {
    try {
      await apiFetch(`/api/photos/${photo.id}`, { method: 'DELETE' });
      toast({ description: 'Foto excluída', variant: 'success' });
      setActionError(null);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao excluir foto',
      );
    }
  };

  return {
    photos,
    listError,
    isLoading,
    actionError,
    uploading,
    refresh,
    upload,
    remove,
  };
}
