import { currentAppVersion } from '@/lib/app-version';

/**
 * Versão da aplicação em texto discreto (ADR-043). Só entra em telas autenticadas: a versão
 * exata não aparece em login nem em páginas públicas. Sem versão válida, não renderiza nada.
 * `version` existe para teste; em uso, vem do build.
 */
export function AppVersion({
  version = currentAppVersion(),
}: {
  version?: string | null;
}) {
  if (!version) return null;
  return (
    <p className="text-ink-3 text-xs" data-app-version>
      {version}
    </p>
  );
}
