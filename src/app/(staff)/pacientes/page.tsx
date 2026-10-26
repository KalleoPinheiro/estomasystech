import { loadBlock } from '@/lib/server/data/load-block';
import { listPartnersFor } from '@/lib/server/data/partners';
import { listPatientsPage } from '@/lib/server/data/patients';
import { requireStaffPageFor } from '@/lib/server/session';
import { PAGE_SIZE } from './page-size';
import { PatientsClient } from './patients-client';

/**
 * Lista de pacientes no servidor (#549, ADR-069): a 1ª página e os parceiros do
 * formulário já vêm no HTML, sem chamada `/api` na carga. Busca digitada e
 * «Carregar mais» seguem Route Handler (exceção do ADR-069: dependem do que a
 * pessoa digita). Falha de leitura não derruba a tela: sem a página pronta, o
 * cliente busca como sempre. Escopo R4 do Profissional dentro de `listPatientsPage`.
 */
export default async function PatientsPage() {
  const session = await requireStaffPageFor('/pacientes');
  const [page, partners] = await Promise.all([
    loadBlock(() => listPatientsPage(session, { limit: PAGE_SIZE })),
    loadBlock(() => listPartnersFor(session)),
  ]);

  return (
    <PatientsClient
      initialPage={page.data ?? undefined}
      partners={partners.data ?? []}
    />
  );
}
