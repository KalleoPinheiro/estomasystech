import { loadBlock } from '@/lib/server/data/load-block';
import { listPlatformAuditFor } from '@/lib/server/data/platform';
import { requirePlatformPage } from '@/lib/server/session';
import { PAGE_SIZE, PlatformAudit } from './platform-audit';

/**
 * Trilha da plataforma no servidor (#558, ADR-069/074): a 1ª página, sem
 * filtro, é lida na requisição e entregue como semente da lista; o período
 * escolhido na tela e «Carregar mais» continuam por `/api/platform/audit`.
 * Falha de leitura deixa a tela sem semente: a ilha busca e mostra o erro.
 */
export default async function PlatformAuditPage() {
  const session = await requirePlatformPage();
  const page = await loadBlock(() =>
    listPlatformAuditFor(session, { limit: PAGE_SIZE }),
  );
  return (
    <PlatformAudit
      seed={
        page.data
          ? {
              baseUrl: '/api/platform/audit',
              items: page.data.events,
              nextCursor: page.data.nextCursor,
            }
          : undefined
      }
    />
  );
}
