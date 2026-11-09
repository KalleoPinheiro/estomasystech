import { fail, ok } from '@/lib/api-response';
import { buildAppVersion } from '@/lib/app-version';

/**
 * Versão pública, só leitura (ADR-095, decisão do dono 2): `{ version }` e nada mais. Sem sessão,
 * sem banco, sem SHA e sem dado de clínica ou paciente: é o `NEXT_PUBLIC_RELEASE_VERSION` /
 * `NEXT_PUBLIC_APP_VERSION` embutido no build. A fumaça de produção confere por aqui que a versão
 * implantada é a da tag. O rodapé da equipe segue em `/api/version`, com sessão (ADR-066).
 */
export function GET() {
  const version = buildAppVersion();
  if (!version) return fail('Versão indisponível', 404);
  const response = ok({ version });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
