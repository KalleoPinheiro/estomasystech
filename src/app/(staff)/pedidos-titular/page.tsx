import { Card } from '@still-void/ui/react';
import Link from 'next/link';
import { EmptyState } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import { StatusBadge } from '@/components/status-badge';
import {
  DATA_REQUEST_STATUSES,
  type DataRequestStatus,
} from '@/domain/patient/data-subject-request';
import {
  DATA_REQUEST_KIND_LABELS,
  DATA_REQUEST_STATUS_LABELS,
  type DataSubjectRequestDto,
} from '@/lib/dto/data-subject-request';
import { formatDateTime } from '@/lib/format';
import { listDataRequestsFor } from '@/lib/server/data/data-requests';
import { loadBlock } from '@/lib/server/data/load-block';
import { requireStaffPageFor } from '@/lib/server/session';
import { ResolveForm } from './resolve-form';

/** Destaque visual do prazo a partir de quantos dias antes (o aviso por e-mail é configurável). */
const DEADLINE_WARNING_DAYS = 3;

/** Situação pedida na URL; valor desconhecido volta para «Pendentes». */
const statusFrom = (value: string | undefined): DataRequestStatus =>
  DATA_REQUEST_STATUSES.find((status) => status === value) ?? 'pending';

/** Prazo de 15 dias (LGPD art. 19): perto de vencer e vencido ficam em destaque. */
function DeadlineLine({ request }: { request: DataSubjectRequestDto }) {
  const [year, month, day] = request.deadlineDate.split('-');
  const daysLeft = request.daysLeft ?? 0;
  const urgent = daysLeft <= DEADLINE_WARNING_DAYS;
  let state = urgent ? 'soon' : 'ok';
  let remaining = `faltam ${daysLeft} dias`;
  if (daysLeft < 0) {
    state = 'overdue';
    remaining = `vencido há ${-daysLeft} ${daysLeft === -1 ? 'dia' : 'dias'}`;
  } else if (daysLeft === 0) {
    remaining = 'vence hoje';
  } else if (daysLeft === 1) {
    remaining = 'falta 1 dia';
  }
  return (
    <p
      className={urgent ? 'font-medium text-danger' : 'text-ink-2'}
      data-deadline={state}
    >
      Prazo para responder: {day}/{month}/{year} · {remaining}
    </p>
  );
}

function RequestCard({ request }: { request: DataSubjectRequestDto }) {
  return (
    <Card className="flex flex-col gap-2 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {DATA_REQUEST_KIND_LABELS[request.kind]}
          </p>
          <p className="text-ink-3 text-xs">
            <Link
              href={`/pacientes/${request.patientId}`}
              className="text-accent-ink hover:underline"
            >
              {request.patientName ?? 'Paciente'}
            </Link>{' '}
            · enviado em {formatDateTime(request.createdAt)}
          </p>
        </div>
        <StatusBadge
          status={request.status}
          label={DATA_REQUEST_STATUS_LABELS[request.status]}
        />
      </div>
      {request.status === 'pending' && <DeadlineLine request={request} />}
      {request.details && <p className="break-words">{request.details}</p>}
      {request.resolution && (
        <p className="break-words text-ink-2">
          <strong>Justificativa:</strong> {request.resolution}
          {request.resolvedAt ? ` (${formatDateTime(request.resolvedAt)})` : ''}
        </p>
      )}
      {request.status === 'pending' && <ResolveForm requestId={request.id} />}
    </Card>
  );
}

/**
 * Fila de pedidos do titular no servidor (#293, #555, ADR-069/074): a lista da
 * situação pedida em `?status=` chega no HTML e a carga não chama `/api`. O
 * Admin de Empresa aceita ou recusa, sempre com justificativa, por Server
 * Action com auditoria na mesma transação. Aceitar só registra a decisão — a
 * correção é feita na ficha do paciente. Outro papel recebe o alerta de acesso
 * (a fila é dado de pessoa), nunca a lista.
 */
export default async function DataRequestsPage(props?: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const session = await requireStaffPageFor('/pedidos-titular');
  const status = statusFrom((await props?.searchParams)?.status);
  const queue = await loadBlock(() => listDataRequestsFor(session, status));

  return (
    <div>
      <PageHeader
        title="Pedidos do titular"
        description="Correção cadastral e eliminação/anonimização pedidas pelos pacientes no portal (LGPD art. 18)."
        actions={
          <nav aria-label="Situação do pedido" className="flex flex-wrap gap-2">
            {DATA_REQUEST_STATUSES.map((value) => (
              <Link
                key={value}
                href={
                  value === 'pending'
                    ? '/pedidos-titular'
                    : `/pedidos-titular?status=${value}`
                }
                aria-current={value === status ? 'page' : undefined}
                className={`flex min-h-11 items-center rounded-full px-3 font-medium text-sm ${
                  value === status
                    ? 'bg-accent-ink text-bg'
                    : 'border border-border-strong text-ink-2 hover:bg-surface-2'
                }`}
              >
                {DATA_REQUEST_STATUS_LABELS[value]}
              </Link>
            ))}
          </nav>
        }
      />
      {queue.error && <RefreshErrorAlert message={queue.error} />}
      {queue.data &&
        (queue.data.length === 0 ? (
          <EmptyState icon="check-circle" message="Nenhum pedido aqui." />
        ) : (
          <ul className="flex flex-col gap-3" data-data-request-queue>
            {queue.data.map((request) => (
              <li key={request.id}>
                <RequestCard request={request} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
