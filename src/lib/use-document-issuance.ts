'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './client';

export type DocumentType =
  | 'atestado'
  | 'consentimento'
  | 'plano-cuidados'
  | 'relatorio'
  | 'repasse'
  | 'recibo';

export interface DocumentIssuance {
  documentNumber: string;
  issuedAt: string;
}

export interface DocumentIssuanceResult {
  issuance: DocumentIssuance | null;
  error: string | null;
}

/**
 * Emissão persistida (#94, DOC-01) — chama `POST /api/documents/issue` uma vez
 * por `documentType`+`resourceId` montado; reimprimir a mesma página reusa o
 * mesmo `documentNumber`/`issuedAt` (a rota é idempotente por natureza).
 */
export function useDocumentIssuance(
  documentType: DocumentType,
  resourceId: string | null,
): DocumentIssuanceResult {
  const [issuance, setIssuance] = useState<DocumentIssuance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!resourceId) return;
    let cancelled = false;
    apiFetch<DocumentIssuance>('/api/documents/issue', {
      method: 'POST',
      body: JSON.stringify({ documentType, resourceId }),
    })
      .then((result) => {
        if (!cancelled) setIssuance(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Erro ao emitir documento',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [documentType, resourceId]);

  return { issuance, error };
}
