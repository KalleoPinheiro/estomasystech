import { PrefetchedQueries } from '@/lib/prefetched-queries';
import { loadBlock } from '@/lib/server/data/load-block';
import { listPlatformClinics } from '@/lib/server/data/platform';
import { requirePlatformPage } from '@/lib/server/session';
import { PlatformClinics } from './platform-clinics';

/**
 * Clínicas da plataforma no servidor (#558, ADR-069/074): a lista, com admin e
 * canal de e-mail de cada uma, é lida na requisição e chega no HTML, sem
 * chamar `/api`. Falha de leitura só deixa o dado de fora: a ilha o busca por
 * `/api/platform/clinics` e mostra o erro com «Tentar novamente».
 */
export default async function PlatformPage() {
  const session = await requirePlatformPage();
  const clinics = await loadBlock(() => listPlatformClinics(session));
  return (
    <PrefetchedQueries
      entries={clinics.data ? { '/api/platform/clinics': clinics.data } : {}}
    >
      <PlatformClinics />
    </PrefetchedQueries>
  );
}
