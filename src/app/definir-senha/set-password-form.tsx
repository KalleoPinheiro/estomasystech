'use client';

import { Button, Input } from '@still-void/ui/react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { SafeForm } from '@/components/safe-form';
import { MIN_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import { apiFetch } from '@/lib/client';

export function RequestNewLink() {
  return (
    <p className="mt-4 text-center text-sm">
      <Link href="/esqueci-senha" className="text-accent-ink hover:underline">
        Solicitar um novo link
      </Link>
    </p>
  );
}

export function SetPasswordForm({ token }: { token: string }) {
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
    <SafeForm onSubmit={handleSubmit}>
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
    </SafeForm>
  );
}
