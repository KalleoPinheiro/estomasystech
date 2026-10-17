'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  FileInput,
  Icon,
  Input,
  Prose,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import Image from 'next/image';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';
import { formatDateTime } from '@/lib/format';

export interface ConsentStatusDto {
  consentText: string;
  accepted: boolean;
  acceptedAt: string | null;
}

/**
 * Consentimento digital (O4.1): paciente lê o termo vigente e aceita no portal.
 * O status vem do pai (`PatientPortalView`) — o mesmo dado governa o envio de
 * foto (COMP3-01), então uma cópia só evita telas divergentes após o aceite.
 */
export function ConsentCard({
  status,
  onAccepted,
}: {
  status: ConsentStatusDto | null;
  onAccepted: () => void;
}) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [revoking, setRevoking] = useState(false);

  if (!status) return null;

  if (status.accepted) {
    const revoke = async () => {
      setRevoking(true);
      setError(null);
      try {
        await apiFetch('/api/portal/patient/consent/revoke', {
          method: 'POST',
        });
        toast({ description: 'Consentimento revogado', variant: 'success' });
        onAccepted();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao revogar consentimento';
        setError(message);
        toast({ description: message, variant: 'danger' });
      } finally {
        setRevoking(false);
      }
    };

    return (
      <div className="flex flex-col gap-2">
        <Alert variant="success" icon={<Icon name="check-circle" />}>
          <AlertDescription>
            Termo de consentimento aceito
            {status.acceptedAt
              ? ` em ${formatDateTime(status.acceptedAt)}`
              : ''}
            .
          </AlertDescription>
        </Alert>
        {error && <ErrorAlert message={error} />}
        {/* PORT-04: endpoint de revogação já existia sem nenhuma UI que o
            chamasse — LGPD art. 8º/18 exige caminho de revogação, não só de
            aceite. */}
        <ConfirmAction
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={revoking}
              className="self-start"
            >
              {revoking ? 'Revogando…' : 'Revogar consentimento'}
            </Button>
          }
          title="Revogar consentimento"
          description="Ao revogar, o envio de novas fotos fica bloqueado até você aceitar o termo de novo. Confirma a revogação?"
          confirmLabel="Revogar"
          variant="danger"
          onConfirm={() => void revoke()}
        />
      </div>
    );
  }

  const accept = async () => {
    setAccepting(true);
    setError(null);
    try {
      await apiFetch('/api/portal/patient/consent', { method: 'POST' });
      toast({
        description: 'Termo de consentimento aceito',
        variant: 'success',
      });
      onAccepted();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao registrar aceite';
      setError(message);
      toast({ description: message, variant: 'danger' });
    } finally {
      // Sai de "Registrando…" mesmo no sucesso: quem confirma o aceite na tela é
      // o status recarregado pelo pai, e essa recarga pode falhar. Se o estado
      // ficasse preso aqui, o botão morria desabilitado e o envio de foto
      // (COMP3-01) seguia bloqueado sem caminho de volta. O POST é idempotente
      // (rota devolve o aceite existente), então tentar de novo é seguro.
      setAccepting(false);
    }
  };

  // Ponto 2: Card permanece manual (não vira Alert — fora de escopo da phase).
  // Apenas documentado aqui; cores e estrutura continuam com classes warning.
  return (
    <Card as="section" className="border-warning bg-warning-soft p-4">
      <h2 className="mb-2 font-bold text-sm text-warning">
        Termo de consentimento pendente
      </h2>
      {error && <ErrorAlert message={error} />}
      <Prose className="mb-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-warning-soft bg-sv-surface p-3 text-sm">
        {status.consentText}
      </Prose>
      <Button
        type="button"
        disabled={accepting}
        onClick={() => void accept()}
        variant="accent"
      >
        {accepting ? 'Registrando…' : 'Li e aceito o termo'}
      </Button>
    </Card>
  );
}

/** Envio remoto de foto (O4.2) para condição ativa do próprio paciente. */
export function PatientPhotoUpload({
  conditionId,
  consentPending,
  byGuardian = false,
  onSent,
}: {
  conditionId: string;
  // Envio exige consentimento vigente (COMP3-01) — avisa antes de escolher o
  // arquivo. Enquanto o status não chegou (null no pai), não bloqueia a tela.
  consentPending: boolean;
  /** O responsável não aceita o termo (ato do titular, ADR-026): a mensagem muda. */
  byGuardian?: boolean;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // PORT-06: escolher o arquivo não envia mais na hora — só monta a prévia.
  // Toque errado na galeria não manda mais foto nenhuma sem confirmação.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const selectFile = (file: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
  };

  const upload = async () => {
    if (!pendingFile) return;
    setSending(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', pendingFile);
      body.append('conditionId', conditionId);
      if (note) body.append('note', note);
      const response = await fetch('/api/portal/patient/photos', {
        method: 'POST',
        body,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? 'Erro ao enviar foto');
      }
      clearSelection();
      setSent(true);
      setNote('');
      toast({ description: 'Foto enviada', variant: 'success' });
      onSent();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao enviar foto';
      setError(message);
      toast({ description: message, variant: 'danger' });
    } finally {
      setSending(false);
    }
  };

  if (consentPending) {
    return (
      <Alert variant="warning" className="mt-2">
        <AlertDescription>
          {byGuardian
            ? 'O termo de consentimento é aceito pelo próprio paciente. Enquanto isso não acontece, não é possível enviar fotos.'
            : 'Aceite o termo de consentimento acima para enviar fotos à equipe.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-bg p-3">
      {error && <ErrorAlert message={error} />}
      {sent && (
        <p className="mb-2 text-success text-xs">
          Foto enviada — a equipe vai avaliar e retorna se for preciso antecipar
          sua consulta.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Observação (opcional): dor, vazamento, vermelhidão…"
          className="h-8 min-w-0 flex-1 text-xs"
        />
        {/* Afordância nativa do FileInput, visível — mesmo padrão de
            condition-photos.tsx (T16). `aria-label` preserva o nome acessível
            que o texto do <label> antigo dava ("Enviar foto"). PORT-06 (#93):
            escolher o arquivo só monta a prévia abaixo — não envia mais
            direto no `onChange`. */}
        <FileInput
          accept="image/jpeg,image/png,image/webp"
          aria-label="Enviar foto"
          disabled={sending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) selectFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {pendingFile && previewUrl && (
        <div className="mt-2 flex items-center gap-3 rounded border border-border bg-sv-surface p-2">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded">
            <Image
              src={previewUrl}
              alt="Prévia da foto selecionada"
              fill
              className="object-cover"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-ink-3 text-xs">{pendingFile.name}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="accent"
                disabled={sending}
                onClick={() => void upload()}
              >
                {sending ? 'Enviando…' : 'Enviar'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={sending}
                onClick={clearSelection}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
