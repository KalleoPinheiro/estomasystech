import { PrefetchedQueries } from '@/lib/prefetched-queries';
import { loadBlock } from '@/lib/server/data/load-block';
import {
  listPlatformClinicAdmins,
  loadPlatformClinicDetail,
} from '@/lib/server/data/platform';
import { requirePlatformPage } from '@/lib/server/session';
import { PlatformClinic } from './platform-clinic';

/**
 * Detalhe da clínica no servidor (#558, ADR-069/074): cadastro, situação,
 * canal de e-mail e Admins de Empresa chegam no HTML. Clínica inexistente ou falha de leitura
 * deixa o dado de fora: a ilha busca por `/api/platform/clinics/[id]` e mostra
 * «Clínica não encontrada» ou o erro, como antes.
 */
export default async function PlatformClinicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformPage();
  const { id } = await params;
  const [clinic, admins] = await Promise.all([
    loadBlock(() => loadPlatformClinicDetail(id)),
    loadBlock(() => listPlatformClinicAdmins(id)),
  ]);
  const base = `/api/platform/clinics/${id}`;
  return (
    <PrefetchedQueries
      entries={{
        ...(clinic.data ? { [base]: clinic.data } : {}),
        ...(admins.data ? { [`${base}/admins`]: admins.data } : {}),
      }}
    >
      <PlatformClinic />
    </PrefetchedQueries>
  );
}
