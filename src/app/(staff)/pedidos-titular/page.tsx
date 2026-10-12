'use client';

import { Button, Card, NativeSelect, Textarea } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import Link from 'next/link';
import { useState } from 'react';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/client';
import {
  DATA_REQUEST_KIND_LABELS,
  DATA_REQUEST_STATUS_LABELS,
  type DataSubjectRequestDto,
} from '@/lib/dto/data-subject-request';
import { formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

type Status = DataSubjectRequestDto['status'];

/**
 * Fila de pedidos do titular (#293): o Admin de Empresa aceita ou recusa,
 * sempre com justificativa. Aceitar só registra a decisão — a correção é feita
 * na ficha do paciente.
 */
export default function DataRequestsPage() {
  const [status, setStatus] = useState<Status>('pending');
  const { data, error, refresh } = useApiQuery<DataSubjectRequestDto[]>(
    `/api/data-requests?status=${status}`,
  );

  return (
    <div>
      <PageHeader
        title="Pedidos do titular"
        description="Correção cadastral e eliminação/anonimização pedidas pelos pacientes no portal (LGPD art. 18)."
        actions={
          <label className="flex flex-col gap-1 text-ink-2 text-sm">
            Situação
            <NativeSelect
              value={status}
              onChange={(event) => setStatus(event.target.value as Status)}
            >
              <option value="pending">
                {DATA_REQUEST_STATUS_LABELS.pending}
              </option>
              <option value="accepted">
                {DATA_REQUEST_STATUS_LABELS.accepted}
              </option>
              <option value="rejected">
                {DATA_REQUEST_STATUS_LABELS.rejected}
              </option>
            </NativeSelect>
          </label>
        }
      />
      {error && <ErrorAlert message={error} />}
      <RequestQueue
        requests={data}
        loading={!data && !error}
        onResolved={refresh}
      />
    </div>
  );
}

function RequestQueue({
  requests,
  loading,
  onResolved,
}: {
  requests: DataSubjectRequestDto[] | null;
  loading: boolean;
  onResolved: () => void;
}) {
  if (loading) return <LoadingIndicator />;
  if (!requests) return null;
  if (requests.length === 0) {
    return <EmptyState icon="check-circle" message="Nenhum pedido aqui." />;
  }
  return (
    <ul className="flex flex-col gap-3" data-data-request-queue>
      {requests.map((request) => (
        <li key={request.id}>
          <RequestCard request={request} onResolved={onResolved} />
        </li>
      ))}
    </ul>
  );
}

function RequestCard({
  request,
  onResolved,
}: {
  request: DataSubjectRequestDto;
  onResolved: () => void;
}) {
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
      {request.details && <p className="break-words">{request.details}</p>}
      {request.resolution && (
        <p className="break-words text-ink-2">
          <strong>Justificativa:</strong> {request.resolution}
          {request.resolvedAt ? ` (${formatDateTime(request.resolvedAt)})` : ''}
        </p>
      )}
      {request.status === 'pending' && (
        <ResolveForm requestId={request.id} onResolved={onResolved} />
      )}
    </Card>
  );
}

function ResolveForm({
  requestId,
  onResolved,
}: {
  requestId: string;
  onResolved: () => void;
}) {
  const { toast } = useToast();
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (decision: 'accept' | 'reject') => {
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<{ notified: boolean }>(
        `/api/data-requests/${requestId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            decision,
            justification: justification.trim(),
          }),
        },
      );
      toast({
        description: result.notified
          ? 'Decisão registrada e paciente avisado por e-mail'
          : 'Decisão registrada. O e-mail não saiu: a resposta fica no portal do paciente.',
        variant: 'success',
      });
      onResolved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao registrar a decisão',
      );
    } finally {
      setSaving(false);
    }
  };

  const blocked = saving || !justification.trim();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        Justificativa (o paciente vê no portal)
        <Textarea
          value={justification}
          maxLength={1000}
          rows={2}
          onChange={(event) => setJustification(event.target.value)}
        />
      </label>
      {error && <ErrorAlert message={error} />}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="accent"
          disabled={blocked}
          onClick={() => void resolve('accept')}
        >
          Aceitar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={blocked}
          onClick={() => void resolve('reject')}
        >
          Recusar
        </Button>
      </div>
    </div>
  );
}
