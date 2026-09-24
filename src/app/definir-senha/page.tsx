'use client';

import { Button, Input } from '@still-void/ui/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';

const MIN_PASSWORD_LENGTH = 8;

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordCard />
    </Suspense>
  );
}

function SetPasswordCard() {
  const token = useSearchParams().get('token') ?? '';

  return (
    <AuthCard>
      <h1 className="sv-display font-bold text-xl">Defina sua senha</h1>
      <p className="mt-1 mb-6 text-ink-3 text-sm">
        Escolha uma senha de pelo menos {MIN_PASSWORD_LENGTH} caracteres para
        acessar o VittaFlow.
      </p>
      {token ? (
        <SetPasswordForm token={token} />
      ) : (
        <MissingLink message="Link incompleto — abra o link exatamente como veio no e-mail." />
      )}
    </AuthCard>
  );
}

function MissingLink({ message }: { message: string }) {
  return (
    <>
      <ErrorAlert message={message} />
      <RequestNewLink />
    </>
  );
}

function RequestNewLink() {
  return (
    <p className="mt-4 text-center text-sm">
      <Link href="/esqueci-senha" className="text-accent-ink hover:underline">
        Solicitar um novo link
      </Link>
    </p>
  );
}

function SetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError('As duas senhas não conferem');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao definir a senha');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div>
        <p className="text-sm">Senha definida. Você já pode entrar.</p>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-accent-ink hover:underline">
            Ir para o login
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Nova senha
        <Input
          required
          type="password"
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="mt-3 block font-medium text-sm">
        Confirme a senha
        <Input
          required
          type="password"
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
        className="mt-4 w-full"
      >
        {submitting ? 'Salvando…' : 'Definir senha'}
      </Button>
      <RequestNewLink />
    </form>
  );
}
