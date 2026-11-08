'use client';

import { Button, Input } from '@still-void/ui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useHydrated } from '@/components/app-shell/use-hydrated';
import { BrandMark } from '@/components/brand-mark';
import { ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';
import {
  type LoginStep,
  MfaCodeStep,
  MfaEnrollStep,
  nextStep,
  type PendingLoginData,
  RecoveryCodesStep,
} from './mfa-steps';

interface LoginCardProps {
  /** Decidido no servidor: há `AUTH_SECRET`, então o login por senha existe. */
  passwordEnabled: boolean;
  /** Mensagem da allowlist (LOG-02), nunca o texto bruto da URL. */
  errorMessage: string | null;
  /** `?next=` validado (só caminho interno, #207) ou `/`. */
  destination: string;
}

/** Ilha cliente do login: só o estado do formulário e do segundo fator. */
export function LoginCard({
  passwordEnabled,
  errorMessage,
  destination,
}: LoginCardProps) {
  const [step, setStep] = useState<LoginStep>({ kind: 'password' });

  if (step.kind !== 'password') {
    return (
      <>
        <BrandMark size={40} className="mb-3 md:hidden" />
        <h1 className="sv-display mb-4 font-bold text-xl">EstomaSysTech</h1>
        <SecondFactor step={step} onStep={setStep} />
      </>
    );
  }

  return (
    <>
      <BrandMark size={40} className="mb-3 md:hidden" />
      <h1 className="sv-display font-bold text-xl">EstomaSysTech</h1>
      <p className="mt-1 mb-6 text-ink-3 text-sm">
        Entre com seu e-mail e sua senha
      </p>
      {errorMessage && <ErrorAlert message={errorMessage} />}
      {passwordEnabled ? (
        <PasswordForm onStep={setStep} destination={destination} />
      ) : (
        <ErrorAlert message="Autenticação não configurada no servidor." />
      )}
    </>
  );
}

/** Segundo fator (ADR-008, ADR-012). */
function SecondFactor({
  step,
  onStep,
}: {
  step: Exclude<LoginStep, { kind: 'password' }>;
  onStep: (step: LoginStep) => void;
}) {
  if (step.kind === 'code') {
    return <MfaCodeStep pendingToken={step.pendingToken} onStep={onStep} />;
  }
  if (step.kind === 'enroll') {
    // `key`: um recadastro depois de outro recomeça o componente do zero.
    return (
      <MfaEnrollStep
        key={step.pendingToken}
        pendingToken={step.pendingToken}
        onStep={onStep}
      />
    );
  }
  return <RecoveryCodesStep codes={step.codes} />;
}

function PasswordForm({
  onStep,
  destination,
}: {
  onStep: (step: LoginStep) => void;
  /** `?next=` validado (só caminho interno, #207) ou `/`. */
  destination: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Antes da hidratação o formulário não é do React: o que se digita some quando ele assume e o
  // «Entrar» faria um envio nativo (GET /login?email=…&password=…, a senha na URL). Os campos e o
  // botão esperam, como o «+ Nova consulta» da agenda (#484, #679).
  const hydrated = useHydrated();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiFetch<PendingLoginData>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      // Super_admin e company_admin: a senha só abre o segundo fator (ADR-012).
      const step = nextStep(data);
      if (step) {
        onStep(step);
        return;
      }
      router.push(destination);
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
          readOnly={!hydrated}
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
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          readOnly={!hydrated}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1"
        />
      </label>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={showPassword}
        onClick={() => setShowPassword((shown) => !shown)}
        className="mt-1"
      >
        {showPassword ? 'Ocultar senha' : 'Mostrar senha'}
      </Button>
      <Button
        type="submit"
        disabled={submitting || !hydrated}
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
      <p className="mt-2 text-center text-ink-3 text-sm">
        Seus dados de saúde são protegidos pela LGPD.{' '}
        <Link href="/privacidade" className="text-accent-ink underline">
          Aviso de privacidade
        </Link>
      </p>
    </form>
  );
}
