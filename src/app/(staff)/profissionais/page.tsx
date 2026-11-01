import { PageHeader } from '@/components/page-header';
import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import { loadBlock } from '@/lib/server/data/load-block';
import { listProfessionalsFor } from '@/lib/server/data/professionals';
import { requireStaffPageFor } from '@/lib/server/session';
import { NewProfessionalButton } from './new-professional-button';
import { ProfessionalsBoard } from './professionals-board';

/**
 * Profissionais no servidor (#550): o cadastro, com registro e repasse, chega
 * no HTML e a carga não chama `/api`. Cadastro, edição, ativar/desativar e
 * horários são Server Actions (`professional-actions.ts`) com auditoria na
 * mesma transação. A tela é do Admin de Empresa (a guarda de página usa a
 * matriz de `/api/professionals`): o repasse é dado financeiro.
 */
export default async function ProfessionalsPage() {
  const session = await requireStaffPageFor('/profissionais');

  const professionals = await loadBlock(() => listProfessionalsFor(session));

  return (
    <div>
      <PageHeader title="Profissionais" actions={<NewProfessionalButton />} />

      {professionals.error && (
        <RefreshErrorAlert message={professionals.error} />
      )}

      <ProfessionalsBoard professionals={professionals.data ?? []} />
    </div>
  );
}
