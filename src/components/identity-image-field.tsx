'use client';

import { Button, FileInput } from '@still-void/ui/react';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { IdentityImage } from '@/components/identity-image';

/** Formatos que o servidor aceita. HEIC fica de fora: o iPhone converte para JPEG ao escolher da galeria. */
export const IDENTITY_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml';

const MAX_BYTES = 5 * 1024 * 1024;

interface IdentityImageFieldProps {
  kind: 'logo' | 'avatar';
  /** Rota da API: `/api/clinic/logo` ou `/api/account/avatar`. */
  endpoint: string;
  /** Nome para as iniciais e para o `alt` da logo. */
  name: string;
  url: string | null | undefined;
  onChanged: (url: string | null) => void;
  /** Aviso quando o armazenamento não está disponível ou a pessoa não pode editar. */
  disabledReason?: string;
}

const readError = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error ?? fallback;
};

/**
 * Envio e remoção de logo ou avatar (#427). `fetch` cru: `apiFetch` fixa
 * `Content-Type: application/json`, que quebra o multipart. O erro do servidor
 * aparece no campo, em linguagem simples, e nada muda se o envio falha.
 */
export function IdentityImageField({
  kind,
  endpoint,
  name,
  url,
  onChanged,
  disabledReason,
}: IdentityImageFieldProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = kind === 'logo' ? 'logo' : 'foto';

  const send = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setError('Imagem excede o limite de 5 MB');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(endpoint, { method: 'POST', body });
      if (!response.ok) {
        throw new Error(await readError(response, `Erro ao enviar a ${noun}`));
      }
      const payload = (await response.json()) as {
        data: { logoUrl?: string; avatarUrl?: string };
      };
      onChanged(payload.data.logoUrl ?? payload.data.avatarUrl ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Erro ao enviar a ${noun}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readError(response, `Erro ao remover a ${noun}`));
      }
      onChanged(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Erro ao remover a ${noun}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || Boolean(disabledReason);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <IdentityImage url={url} name={name} kind={kind} size={64} />
        <div className="flex min-w-0 flex-col gap-2">
          <FileInput
            aria-label={kind === 'logo' ? 'Enviar logo' : 'Enviar foto'}
            accept={IDENTITY_ACCEPT}
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void send(file);
              e.target.value = '';
            }}
          />
          {url && !disabledReason && (
            <ConfirmAction
              title={`Remover a ${noun}?`}
              description={
                kind === 'logo'
                  ? 'A clínica volta a mostrar as iniciais.'
                  : 'Você volta a aparecer com as iniciais.'
              }
              confirmLabel="Remover"
              onConfirm={remove}
              trigger={
                <Button variant="ghost" size="sm" disabled={busy}>
                  Remover {noun}
                </Button>
              }
            />
          )}
        </div>
      </div>
      <p className="text-ink-3 text-xs">
        PNG, JPEG, WebP, GIF, AVIF ou SVG, até 5 MB. A imagem é reduzida e
        recodificada ao enviar.
      </p>
      {disabledReason && (
        <p className="font-medium text-sm text-warning">{disabledReason}</p>
      )}
      {error && <ErrorAlert message={error} />}
    </div>
  );
}
