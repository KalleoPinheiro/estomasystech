'use client';

import { Button, Card, Input } from '@still-void/ui/react';
import { useState } from 'react';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { IdentityImageField } from '@/components/identity-image-field';
import { OtpauthQr } from '@/components/otpauth-qr';
import { SafeForm } from '@/components/safe-form';
import { MIN_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import { apiFetch } from '@/lib/client';
import { useApiQuery } from '@/lib/use-api-query';

interface OwnAccount {
  email: string;
  role: string;
  avatarUrl?: string | null;
  imageUploadAvailable?: boolean;
  mfa: { policy: 'required' | 'optional' | 'none'; enrolled: boolean };
}

interface Enrollment {
  secret: string;
  otpauthUri: string;
  pendingToken: string;
}

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const post = <T,>(url: string, body: Record<string, string>) =>
  apiFetch<T>(url, { method: 'POST', body: JSON.stringify(body) });

/**
 * "Minha conta" (#295): troca da própria senha e segundo fator. Vale para toda
 * a equipe, inclusive o Super Admin (a página dele fica em `/plataforma`).
 */
export function OwnAccountPanel() {
  const { data, error, isLoading, refresh } =
    useApiQuery<OwnAccount>('/api/me');

  if (isLoading) return <LoadingIndicator />;
  if (error || !data) {
    return <ErrorAlert message={error ?? 'Conta não encontrada'} />;
  }
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-ink-3 text-sm">
        Conectado como <strong>{data.email}</strong>.
      </p>
      <AvatarCard account={data} />
      <PasswordCard />
      <MfaCard account={data} onChanged={refresh} />
    </div>
  );
}

function AvatarCard({ account }: { account: OwnAccount }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Foto</h2>
      <p className="mb-4 text-ink-3 text-sm">
        Aparece para a equipe da clínica. Sem foto, mostramos as suas iniciais.
      </p>
      <IdentityImageField
        kind="avatar"
        endpoint="/api/account/avatar"
        name={account.email.split('@')[0].replace(/[._-]+/g, ' ')}
        url={url === undefined ? account.avatarUrl : url}
        onChanged={setUrl}
        disabledReason={
          account.imageUploadAvailable === false
            ? 'O envio de imagens está indisponível neste ambiente (armazenamento não configurado).'
            : undefined
        }
      />
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setDone(false);
    if (next !== confirmation) {
      setError('As duas senhas não conferem');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await post('/api/me/password', {
        currentPassword: current,
        newPassword: next,
      });
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirmation('');
    } catch (err) {
      setError(errorMessage(err, 'Erro ao trocar a senha'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <SafeForm onSubmit={handleSubmit} className="p-4">
        <h2 className="font-semibold text-base">Trocar a senha</h2>
        <p className="mt-1 mb-4 text-ink-3 text-sm">
          Pelo menos {MIN_PASSWORD_LENGTH} caracteres e nada de senhas comuns.
          Ao trocar, as suas outras sessões são encerradas.
        </p>
        {error && <ErrorAlert message={error} />}
        {done && (
          <p role="status" className="mb-4 text-sm text-success">
            Senha alterada. As outras sessões foram encerradas.
          </p>
        )}
        <label className="block font-medium text-sm">
          Senha atual
          <Input
            required
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="mt-3 block font-medium text-sm">
          Nova senha
          <Input
            required
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="mt-3 block font-medium text-sm">
          Confirme a nova senha
          <Input
            required
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="mt-1"
          />
        </label>
        <Button
          type="submit"
          disabled={submitting}
          variant="accent"
          className="mt-4"
        >
          {submitting ? 'Salvando…' : 'Trocar senha'}
        </Button>
      </SafeForm>
    </Card>
  );
}

function MfaCard({
  account,
  onChanged,
}: {
  account: OwnAccount;
  onChanged: () => void;
}) {
  const { policy, enrolled } = account.mfa;
  return (
    <Card>
      <div className="p-4">
        <h2 className="font-semibold text-base">
          Segundo fator (autenticador)
        </h2>
        {policy === 'none' ? (
          <p className="mt-1 text-ink-3 text-sm">
            Este tipo de conta não usa segundo fator.
          </p>
        ) : enrolled ? (
          <p className="mt-1 text-ink-3 text-sm">
            Ativo. Se perder o celular, entre com um código de recuperação ou
            peça ao administrador da clínica para redefinir o segundo fator.
          </p>
        ) : (
          <EnableMfa onDone={onChanged} />
        )}
      </div>
    </Card>
  );
}

function EnableMfa({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setSubmitting(false);
    }
  };

  const start = (event: React.FormEvent) => {
    event.preventDefault();
    return run(async () => {
      setEnrollment(
        await post<Enrollment>('/api/me/mfa/enroll', {
          currentPassword: password,
        }),
      );
      setPassword('');
    }, 'Erro ao iniciar o cadastro');
  };

  const confirm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!enrollment) return;
    return run(async () => {
      const data = await post<{ recoveryCodes: string[] }>(
        '/api/me/mfa/confirm',
        { pendingToken: enrollment.pendingToken, code },
      );
      setRecoveryCodes(data.recoveryCodes);
    }, 'Erro ao confirmar o código');
  };

  if (recoveryCodes) {
    return (
      <div>
        <p className="mt-1 mb-3 text-ink-3 text-sm">
          Segundo fator ativado. Guarde os códigos de recuperação: cada um
          funciona uma única vez e eles não serão exibidos de novo.
        </p>
        <ul
          aria-label="Códigos de recuperação"
          className="grid grid-cols-2 gap-2 font-mono text-sm"
        >
          {recoveryCodes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Button
          type="button"
          variant="accent"
          className="mt-4"
          onClick={onDone}
        >
          Já guardei os códigos
        </Button>
      </div>
    );
  }

  if (enrollment) {
    return (
      <SafeForm onSubmit={confirm}>
        <p className="mt-1 mb-3 text-ink-3 text-sm">
          No app autenticador (Google Authenticator, Authy, 1Password…), leia o
          QR code, adicione a chave abaixo ou abra o link neste aparelho. Depois
          digite o código de 6 dígitos.
        </p>
        {error && <ErrorAlert message={error} />}
        <OtpauthQr uri={enrollment.otpauthUri} />
        <p className="font-medium text-sm">Chave</p>
        <p
          className="mt-1 break-all font-mono text-sm"
          data-testid="mfa-secret"
        >
          {enrollment.secret}
        </p>
        <a
          href={enrollment.otpauthUri}
          className="mt-2 inline-block text-accent-ink text-sm hover:underline"
        >
          Abrir no app autenticador
        </a>
        <label className="mt-3 block font-medium text-sm">
          Código do autenticador
          <Input
            required
            name="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            className="mt-1"
          />
        </label>
        <Button
          type="submit"
          disabled={submitting}
          variant="accent"
          className="mt-4"
        >
          {submitting ? 'Confirmando…' : 'Confirmar'}
        </Button>
      </SafeForm>
    );
  }

  return (
    <SafeForm onSubmit={start}>
      <p className="mt-1 mb-3 text-ink-3 text-sm">
        Desligado. Ligue para pedir um código do celular a cada entrada. Ao
        ligar, as suas outras sessões são encerradas.
      </p>
      {error && <ErrorAlert message={error} />}
      <label className="block font-medium text-sm">
        Senha atual
        <Input
          required
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1"
        />
      </label>
      <Button
        type="submit"
        disabled={submitting}
        variant="accent"
        className="mt-4"
      >
        {submitting ? 'Iniciando…' : 'Ligar segundo fator'}
      </Button>
    </SafeForm>
  );
}
