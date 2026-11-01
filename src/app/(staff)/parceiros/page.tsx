import { PageHeader } from '@/components/page-header';
import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import { loadBlock } from '@/lib/server/data/load-block';
import { listPartnersFor } from '@/lib/server/data/partners';
import { requireStaffPageFor } from '@/lib/server/session';
import { NewPartnerButton } from './new-partner-button';
import { PartnersBoard } from './partners-board';

/**
 * Parceiros no servidor (#550): a lista chega no HTML e a carga não chama
 * `/api`. Cadastro, edição e ativar/desativar são Server Actions
 * (`partner-actions.ts`) com auditoria na mesma transação.
 */
export default async function PartnersPage() {
  const session = await requireStaffPageFor('/parceiros');

  const partners = await loadBlock(() => listPartnersFor(session));

  return (
    <div>
      <PageHeader
        title="Parceiros"
        description="Parceiros indicam pacientes e acompanham a evolução das suas indicações pelo portal, entrando com a conta Google do email cadastrado aqui."
        actions={<NewPartnerButton />}
      />

      {partners.error && <RefreshErrorAlert message={partners.error} />}

      <PartnersBoard partners={partners.data ?? []} />
    </div>
  );
}
