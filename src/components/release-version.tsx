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
  initial,
}: {
  /** `/api/portal/version` no portal; a equipe lê de `/api/version`. */
  url?: string;
  /**
   * Versão já lida no servidor (ADR-069): sem chamada de API na carga. `null` =
   * o servidor não achou versão e vale a do build; ausente = busca em `url`.
   */
  initial?: AppVersionDto | null;
}) {
  const { data } = useApiQuery<AppVersionDto>(
    initial === undefined ? url : null,
  );
  const shown = initial === undefined ? data : initial;
  const label = shown ? formatAppVersion(shown.version, shown.sha) : null;
  return label ? <AppVersion version={label} /> : <AppVersion />;
}
