'use client';

import { Button, CardSkeleton, Input } from '@still-void/ui/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';
import { useApiQuery } from '@/lib/use-api-query';

interface Providers {
  password: boolean;
}

// Allowlist de mensagens de erro (LOG-02): nunca renderiza o valor bruto de
// `?error=` — texto arbitrário da URL dentro da marca é vetor de phishing por
// texto refletido, mesmo sem XSS (React já escapa).
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  session_expired: 'Sua sessão expirou. Entre novamente.',
};
const GENERIC_LOGIN_ERROR =
  'Não foi possível concluir a operação. Tente novamente.';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  );
}

function LoginCard() {
  const searchParams = useSearchParams();
  const { data: providers } = useApiQuery<Providers>('/api/auth/providers');
  const redirectErrorCode = searchParams.get('error');
  const redirectErrorMessage = redirectErrorCode
    ? (LOGIN_ERROR_MESSAGES[redirectErrorCode] ?? GENERIC_LOGIN_ERROR)
    : null;

  return (
    <AuthCard>
      <h1 className="sv-display font-bold text-xl">VittaFlow</h1>
      <p className="mt-1 mb-6 text-ink-3 text-sm">
        Entre com seu e-mail e sua senha
      </p>
      {redirectErrorMessage && <ErrorAlert message={redirectErrorMessage} />}
      {providers ? (
        providers.password ? (
          <PasswordForm />
        ) : (
          <ErrorAlert message="Autenticação não configurada no servidor." />
        )
      ) : (
        <CardSkeleton />
      )}
    </AuthCard>
  );
}

function PasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Email
        <Input
          required
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          className="mt-1"
        />
      </label>
      <label className="mt-3 block font-medium text-sm">
        Senha
        <Input
          required
          type="password"
          name="password"
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
        className="mt-4 w-full"
      >
        {submitting ? 'Entrando…' : 'Entrar'}
      </Button>
      <p className="mt-4 text-center text-sm">
        <Link href="/esqueci-senha" className="text-accent-ink hover:underline">
          Esqueci minha senha
        </Link>
      </p>
    </form>
  );
}
