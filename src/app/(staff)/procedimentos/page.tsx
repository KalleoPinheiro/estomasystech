import { PageHeader } from '@/components/page-header';
import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import { loadBlock } from '@/lib/server/data/load-block';
import { listProceduresFor } from '@/lib/server/data/procedures';
import { listSuppliesFor } from '@/lib/server/data/supplies';
import { requireStaffPageFor } from '@/lib/server/session';
import { NewProcedureButton } from './new-procedure-button';
import { ProceduresBoard } from './procedures-board';

/**
 * Procedimentos no servidor (#556, ADR-083): o catálogo e os insumos do kit
 * chegam no HTML, em paralelo, e a carga não chama `/api`. Cadastro, edição,
 * ativar/desativar e kit são Server Actions (`procedure-actions.ts`) com
 * auditoria na mesma transação; os itens do kit de um procedimento são lidos
 * sob demanda, ao abrir o kit.
 */
export default async function ProceduresPage() {
  const session = await requireStaffPageFor('/procedimentos');

  const [procedures, supplies] = await Promise.all([
    loadBlock(() => listProceduresFor(session)),
    loadBlock(() => listSuppliesFor(session)),
  ]);
  const error = procedures.error ?? supplies.error;

  return (
    <div>
      <PageHeader
        title="Procedimentos"
        description="O tempo define o tamanho do horário na agenda. Nome, preço e duração vêm só daqui, então a margem por procedimento fica consistente."
        actions={<NewProcedureButton />}
      />

      {error && <RefreshErrorAlert message={error} />}

      <ProceduresBoard
        procedures={procedures.data ?? []}
        supplies={supplies.data ?? []}
      />
    </div>
  );
}
