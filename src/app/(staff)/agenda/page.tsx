import { Button, CardSkeleton } from '@still-void/ui/react';
import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { requireStaffPage } from '@/lib/server/session';
import { AgendaData } from './agenda-data';
import { parseAgendaQuery } from './agenda-range';

type AgendaSearchParams = Record<string, string | string[] | undefined>;

/**
 * Agenda no servidor (#551, ADR-069/074): a página lê o recorte da URL
 * (`?visao`, `?dia`, `?status`, `?profissional`), busca consultas, contagem,
 * grade, feriados, profissionais e fila em paralelo e entrega tudo à tela
 * cliente por props. A carga não chama `/api`. Tudo fica atrás de UM
 * `<Suspense>` cujo esqueleto tem o mesmo cabeçalho: a tela chega inteira num
 * flush e nada que aparece depois empurra o resto (CLS).
 */
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<AgendaSearchParams>;
}) {
  const session = await requireStaffPage({ next: '/agenda' });
  const { query, entry } = parseAgendaQuery(await searchParams);

  return (
    <Suspense fallback={<AgendaSkeleton />}>
      <AgendaData session={session} query={query} entry={entry} />
    </Suspense>
  );
}

function AgendaSkeleton() {
  return (
    <div aria-busy="true">
      <PageHeader
        title="Agenda"
        actions={
          <Button type="button" disabled variant="accent">
            + Nova consulta
          </Button>
        }
      />
      <div className="mb-4 h-11" />
      <CardSkeleton />
    </div>
  );
}
