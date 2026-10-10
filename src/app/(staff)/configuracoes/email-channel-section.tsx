'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Input,
  NativeSelect,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import type { EmailProvider } from '@/domain/clinic/clinic-channel';
import { apiFetch } from '@/lib/client';
import type { EmailChannelDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { useStaffAccess, useStaffIdentity } from '@/lib/staff-access';
import { useApiQuery } from '@/lib/use-api-query';

const ENDPOINT = '/api/settings/email-channel';

const PROVIDER_OPTIONS: { value: EmailProvider; label: string }[] = [
  { value: 'resend', label: 'Resend' },
];

const NO_CHANNEL_MESSAGE =
  'Nenhum canal configurado — e-mails automáticos, convites e redefinições não são enviados por esta clínica.';

type TestOutcome = Pick<
  EmailChannelDto,
  'lastStatus' | 'lastStatusAt' | 'lastError'
>;

interface Draft {
  provider: EmailProvider;
  sender: string;
  apiKey: string;
}

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Canal de e-mail da clínica (C3, #266): o Admin de Empresa, que paga a conta
 * do provedor, informa remetente e chave (só de escrita), testa e remove.
 * Sem acesso à rota, a seção nem aparece — esconder é UX; a API é a barreira.
 */
export function EmailChannelSection() {
  const can = useStaffAccess();
  if (!can(ENDPOINT)) return null;
  return <EmailChannelCard />;
}

function EmailChannelCard() {
  const { data, error, refresh } = useApiQuery<{
    channel: EmailChannelDto | null;
  }>(ENDPOINT);

  return (
    <Card as="section" className="p-5" aria-labelledby="email-channel-title">
      <h2 id="email-channel-title" className="mb-1 font-semibold text-lg">
        Canal de e-mail
      </h2>
      <p className="mb-4 text-ink-3 text-sm">
        Conta do provedor de e-mail da clínica: lembretes, convites e
        redefinições de senha saem por ela, com o remetente informado aqui. A
        chave é guardada cifrada e nunca é mostrada de volta.
      </p>
      {error && <ErrorAlert message={error} />}
      {!error && !data && <LoadingIndicator />}
      {data && (
        <EmailChannelForm
          key={`${data.channel?.sender ?? ''}:${data.channel?.secretLast4 ?? ''}`}
          channel={data.channel}
          onChanged={refresh}
        />
      )}
    </Card>
  );
}

function EmailChannelForm({
  channel,
  onChanged,
}: {
  channel: EmailChannelDto | null;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>({
    provider: channel?.provider ?? 'resend',
    sender: channel?.sender ?? '',
    apiKey: '',
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      await apiFetch(ENDPOINT, {
        method: 'PUT',
        body: JSON.stringify({
          provider: draft.provider,
          sender: draft.sender,
          apiKey: draft.apiKey || null,
        }),
      });
      toast({ description: 'Canal de e-mail salvo', variant: 'success' });
      onChanged();
    }, 'Erro ao salvar o canal de e-mail');

  const remove = () =>
    run(async () => {
      await apiFetch(ENDPOINT, { method: 'DELETE' });
      toast({ description: 'Canal de e-mail removido', variant: 'success' });
      onChanged();
    }, 'Erro ao remover o canal de e-mail');

  return (
    <div className="flex flex-col gap-4">
      {!channel && (
        <p className="font-medium text-sm text-warning">{NO_CHANNEL_MESSAGE}</p>
      )}
      {actionError && <ErrorAlert message={actionError} />}
      <ChannelFields draft={draft} channel={channel} onChange={setDraft} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="accent"
          disabled={busy}
          onClick={() => void save()}
        >
          Salvar canal
        </Button>
        {channel && (
          <ConfirmAction
            trigger={
              <Button type="button" variant="outline" disabled={busy}>
                Remover canal
              </Button>
            }
            title="Remover canal de e-mail"
            description="Remover o canal de e-mail? A clínica deixa de enviar e-mails automáticos, convites e redefinições."
            confirmLabel="Remover canal"
            variant="danger"
            onConfirm={remove}
          />
        )}
      </div>
      {channel && <ChannelTest channel={channel} />}
    </div>
  );
}

function ChannelFields({
  draft,
  channel,
  onChange,
}: {
  draft: Draft;
  channel: EmailChannelDto | null;
  onChange: (draft: Draft) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="font-medium text-sm">
        Provedor
        <NativeSelect
          value={draft.provider}
          onChange={(e) =>
            onChange({ ...draft, provider: e.target.value as EmailProvider })
          }
          className="mt-1"
        >
          {PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="font-medium text-sm">
        Remetente
        <Input
          value={draft.sender}
          placeholder="Clínica X <contato@clinicax.com.br>"
          onChange={(e) => onChange({ ...draft, sender: e.target.value })}
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Chave de API
        <Input
          type="password"
          autoComplete="off"
          value={draft.apiKey}
          placeholder={channel ? 'Em branco mantém a chave atual' : undefined}
          onChange={(e) => onChange({ ...draft, apiKey: e.target.value })}
          className="mt-1"
        />
        {channel && (
          <span className="mt-1 block font-normal text-ink-3 text-xs">
            Chave atual: ••••{channel.secretLast4}
          </span>
        )}
      </label>
    </div>
  );
}

/**
 * Teste explícito da chave e do domínio (design, Decisions: Teste do canal):
 * o e-mail vai para a conta logada. Sem resultado novo, mostra o último.
 */
function ChannelTest({ channel }: { channel: EmailChannelDto }) {
  const identity = useStaffIdentity();
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const sendTest = async () => {
    setSending(true);
    setError(null);
    try {
      setOutcome(
        await apiFetch<TestOutcome>(`${ENDPOINT}/test`, { method: 'POST' }),
      );
    } catch (err) {
      setError(errorMessage(err, 'Erro ao enviar o e-mail de teste'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-border border-t pt-4">
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={sending}
          onClick={() => void sendTest()}
        >
          Enviar e-mail de teste
        </Button>
      </div>
      {error && <ErrorAlert message={error} />}
      <TestStatus
        outcome={outcome ?? channel}
        recipient={
          outcome ? (identity?.identity?.account?.email ?? null) : null
        }
      />
    </div>
  );
}

function TestStatus({
  outcome,
  recipient,
}: {
  outcome: TestOutcome;
  recipient: string | null;
}) {
  if (outcome.lastStatus === 'failed') {
    return (
      <Alert variant="danger">
        <AlertDescription>
          O teste falhou: {outcome.lastError ?? 'erro desconhecido'}
        </AlertDescription>
      </Alert>
    );
  }
  if (outcome.lastStatus !== 'ok' || !outcome.lastStatusAt) {
    return <p className="text-ink-3 text-sm">Canal ainda não testado.</p>;
  }
  const when = formatDateTime(outcome.lastStatusAt);
  return (
    <p className="text-sm" role="status">
      {recipient
        ? `Teste enviado para ${recipient} em ${when}`
        : `Último teste enviado em ${when}`}
    </p>
  );
}
