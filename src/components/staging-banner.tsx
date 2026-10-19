import { Alert, AlertDescription } from '@still-void/ui/react';
import { resolveAppEnv } from '@/lib/runtime-env';

/**
 * Faixa fixa em homologação e preview (ADR-041): deixa claro, em toda tela, que
 * o ambiente usa só dados fictícios. Em produção e no desenvolvimento local
 * não renderiza nada.
 */
export function StagingBanner({
  env = process.env,
}: {
  env?: Readonly<Record<string, string | undefined>>;
}) {
  const appEnv = resolveAppEnv(env);
  if (appEnv !== 'staging' && appEnv !== 'preview') {
    return null;
  }
  return (
    <Alert>
      <AlertDescription>
        Homologação ({appEnv}): dados fictícios. Não cadastre pessoas reais.
      </AlertDescription>
    </Alert>
  );
}
