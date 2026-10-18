'use client';

import { Button, Card, NativeSelect, Textarea } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/client';
import { DATA_RIGHTS_NOTICE } from '@/lib/data-rights-text';
import {
  DATA_REQUEST_KIND_LABELS,
  DATA_REQUEST_STATUS_LABELS,
  type DataSubjectRequestDto,
} from '@/lib/dto/data-subject-request';
import { formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

type Kind = DataSubjectRequestDto['kind'];

/** Salva o JSON no aparelho do paciente, sem abrir aba nova. */
function saveJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Direitos do titular no portal (LGPD art. 18, #293): baixar a cópia dos
 * próprios dados e pedir correção ou eliminação, que a clínica analisa.
 */
export function DataRights() {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const data = await apiFetch<unknown>('/api/portal/patient/export');
      saveJson(data, 'meus-dados.json');
      toast({
        description: 'Cópia dos seus dados baixada',
        variant: 'success',
      });
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : 'Erro ao baixar seus dados',
        variant: 'danger',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section data-data-rights>
      <h2 className="mb-3 font-semibold text-lg">Meus dados (LGPD)</h2>
      <Card className="flex flex-col gap-4 p-4">
        <p className="text-ink-3 text-sm" data-legal-notice>
          {DATA_RIGHTS_NOTICE}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          disabled={downloading}
          onClick={() => void download()}
        >
          Baixar cópia dos meus dados
        </Button>
        <DataRequests />
      </Card>
    </section>
  );
}

function DataRequests() {
  const { toast } = useToast();
  const { data, refresh } = useApiQuery<DataSubjectRequestDto[]>(
    '/api/portal/patient/data-requests',
  );
  const [kind, setKind] = useState<Kind>('correction');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/portal/patient/data-requests', {
        method: 'POST',
        body: JSON.stringify({ kind, details: details.trim() || null }),
      });
      setDetails('');
      toast({
        description: 'Pedido enviado. A clínica vai analisar.',
        variant: 'success',
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar o pedido');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium">Pedir correção ou eliminação</h3>
      <label className="flex flex-col gap-1 text-sm">
        Tipo de pedido
        <NativeSelect
          value={kind}
          onChange={(event) => setKind(event.target.value as Kind)}
        >
          <option value="correction">
            {DATA_REQUEST_KIND_LABELS.correction}
          </option>
          <option value="erasure">{DATA_REQUEST_KIND_LABELS.erasure}</option>
        </NativeSelect>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {kind === 'correction'
          ? 'O que precisa ser corrigido?'
          : 'Motivo (opcional)'}
        <Textarea
          value={details}
          maxLength={1000}
          rows={3}
          onChange={(event) => setDetails(event.target.value)}
        />
      </label>
      {error && <ErrorAlert message={error} />}
      <Button
        type="button"
        size="sm"
        className="self-start"
        disabled={saving || (kind === 'correction' && !details.trim())}
        onClick={() => void submit()}
      >
        Enviar pedido
      </Button>
      {Array.isArray(data) && data.length > 0 && (
        <RequestList requests={data} />
      )}
    </div>
  );
}

function RequestList({ requests }: { requests: DataSubjectRequestDto[] }) {
  return (
    <ul className="divide-y divide-border text-sm" data-data-requests>
      {requests.map((request) => (
        <li key={request.id} className="flex flex-col gap-1 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {DATA_REQUEST_KIND_LABELS[request.kind]}
              </p>
              <p className="text-ink-3 text-xs">
                Enviado em {formatDateTime(request.createdAt)}
              </p>
            </div>
            <StatusBadge
              status={request.status}
              label={DATA_REQUEST_STATUS_LABELS[request.status]}
            />
          </div>
          {request.details && (
            <p className="break-words text-ink-2">{request.details}</p>
          )}
          {request.resolution && (
            <p className="break-words">
              <strong>Resposta da clínica:</strong> {request.resolution}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
