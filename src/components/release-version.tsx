'use client';

import { AppVersion } from '@/components/app-version';
import { formatAppVersion } from '@/lib/app-version';
import type { AppVersionDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';

/**
 * Rodapé de versão (ADR-066): lê `GET /api/version` (portal: `/api/portal/version`), que traz a release gravada no banco, e
 * enquanto carrega ou se a leitura falhar mostra a versão embutida no build (`AppVersion`).
 */
export function ReleaseVersion({
  url = '/api/version',
}: {
  /** `/api/portal/version` no portal; a equipe lê de `/api/version`. */
  url?: string;
}) {
  const { data } = useApiQuery<AppVersionDto>(url);
  const label = data ? formatAppVersion(data.version, data.sha) : null;
  return label ? <AppVersion version={label} /> : <AppVersion />;
}
