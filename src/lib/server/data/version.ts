import 'server-only';
import { cache } from 'react';
import { currentVersionReader } from '@/infrastructure/release/app-release-service';
import type { AppVersionDto } from '@/lib/dto';

/**
 * Versão do sistema para o rodapé da equipe (ADR-066), a mesma de
 * `GET /api/version`. Dado global, sem empresa nem pessoa; o leitor já guarda
 * 5 minutos no processo, então aqui só deduplica por requisição. `null` = nem o
 * build tem versão válida.
 */
export const getAppVersion = cache(async (): Promise<AppVersionDto | null> => {
  const current = await currentVersionReader().read();
  if (!current) return null;
  return {
    version: current.version,
    releasedAt: current.releasedAt?.toISOString() ?? null,
    ...(current.sha ? { sha: current.sha } : {}),
  };
});
