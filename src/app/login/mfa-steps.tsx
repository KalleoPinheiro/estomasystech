'use client';

import { Button, Input } from '@still-void/ui/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';

/**
 * Segunda etapa do login do super_admin (ADR-007, bloco B2). O token pendente
 * vive só no estado do componente: nunca vai para a URL nem para o storage.
 */
export type LoginStep =
  | { kind: 'password' }
  | { kind: 'code'; pendingToken: string }
  | { kind: 'enroll'; pendingToken: string }
  | { kind: 'recoveryCodes'; codes: string[] };

export interface PendingLoginData {
  mfaRequired?: boolean;
  mfaEnrollmentRequired?: boolean;
  pendingToken?: string;
}

/** Próxima etapa a partir da resposta do login (ou da verificação). */
export function nextStep(data: PendingLoginData | null): LoginStep | null {
  if (data?.pendingToken && data.mfaEnrollmentRequired) {
    return { kind: 'enroll', pendingToken: data.pendingToken };
  }
  if (data?.pendingToken && data.mfaRequired) {
    return { kind: 'code', pendingToken: data.pendingToken };
  }
  return null;
}

const PLATFORM_HOME = '/plataforma';

const verify = <T,>(body: Record<string, string>) =>
  apiFetch<T>('/api/auth/mfa/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

function useGoToPlatform() {
  const router = useRouter();
  return () => {
    router.push(PLATFORM_HOME);
    router.refresh();
  };
}

function RestartLogin({ onRestart }: { onRestart: () => void }) {
  return (
    <p className="mt-4 text-center text-sm">
      <Button type="button" variant="link" onClick={onRestart}>
        Voltar ao login
      </Button>
    </p>
  );
}

interface CodeStepProps {
  pendingToken: string;
  onStep: (step: LoginStep) => void;
}

/** Código do autenticador, ou código de recuperação (leva ao recadastro). */
export function MfaCodeStep({ pendingToken, onStep }: CodeStepProps) {
  const goToPlatform = useGoToPlatform();
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data = await verify<PendingLoginData>(
        useRecovery
          ? { pendingToken, recoveryCode: value }
          : { pendingToken, code: value },
      );
      const step = nextStep(data);
      if (step) onStep(step);
      else goToPlatform();
    } catch (err) {
      setError(errorMessage(err, 'Erro ao verificar o código'));
      setSubmitting(false);
    }
  };

  const toggle = () => {
    setUseRecovery((current) => !current);
    setValue('');
    setError(null);
  };

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-4 text-ink-3 text-sm">
        {useRecovery
          ? 'Digite um dos códigos de recuperação que você guardou. Depois dele, cadastre o autenticador de novo.'
          : 'Digite o código de 6 dígitos do seu app autenticador.'}
      </p>
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        {useRecovery ? 'Código de recuperação' : 'Código do autenticador'}
        <Input
          required
          name={useRecovery ? 'recovery-code' : 'code'}
          autoComplete="one-time-code"
          inputMode={useRecovery ? 'text' : 'numeric'}
          maxLength={useRecovery ? 16 : 6}
          value={value}
          onChange={(e) => setValue(e.target.value.trim())}
          className="mt-1"
        />
      </label>
      <Button
        type="submit"
        disabled={submitting}
        variant="accent"
        className="mt-4 w-full"
      >
        {submitting ? 'Verificando…' : 'Verificar'}
      </Button>
      <p className="mt-4 text-center text-sm">
        <Button type="button" variant="link" onClick={toggle}>
          {useRecovery
            ? 'Usar o código do autenticador'
            : 'Usar um código de recuperação'}
        </Button>
      </p>
      <RestartLogin onRestart={() => onStep({ kind: 'password' })} />
    </form>
  );
}

interface Enrollment {
  secret: string;
  otpauthUri: string;
  pendingToken: string;
}

/**
 * Cadastro obrigatório do autenticador (primeiro acesso ou depois de um código
 * de recuperação). Chave em texto e link `otpauth://`; sem QR (Open 3).
 */
export function MfaEnrollStep({ pendingToken, onStep }: CodeStepProps) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<Enrollment>('/api/auth/mfa/enroll', {
      method: 'POST',
      body: JSON.stringify({ pendingToken }),
    })
      .then((data) => active && setEnrollment(data))
      .catch(
        (err) =>
          active && setError(errorMessage(err, 'Erro ao iniciar o cadastro')),
      );
    return () => {
      active = false;
    };
  }, [pendingToken]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!enrollment) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await verify<{ recoveryCodes: string[] }>({
        pendingToken: enrollment.pendingToken,
        code,
      });
      onStep({ kind: 'recoveryCodes', codes: data.recoveryCodes });
    } catch (err) {
      setError(errorMessage(err, 'Erro ao confirmar o código'));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="font-semibold text-base">Cadastre o app autenticador</h2>
      <p className="mt-1 mb-4 text-ink-3 text-sm">
        O acesso à plataforma exige um segundo fator. No app autenticador
        (Google Authenticator, Authy, 1Password…), adicione a chave abaixo ou
        abra o link neste aparelho.
      </p>
      {error && <ErrorAlert message={error} />}
      {enrollment && (
        <div className="mb-4">
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
        </div>
      )}
      <label className="font-medium text-sm">
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
        disabled={submitting || !enrollment}
        variant="accent"
        className="mt-4 w-full"
      >
        {submitting ? 'Confirmando…' : 'Confirmar'}
      </Button>
      <RestartLogin onRestart={() => onStep({ kind: 'password' })} />
    </form>
  );
}

/** Os 10 códigos, exibidos uma única vez. A sessão já foi emitida. */
export function RecoveryCodesStep({ codes }: { codes: string[] }) {
  const goToPlatform = useGoToPlatform();
  return (
    <div>
      <h2 className="font-semibold text-base">
        Guarde seus códigos de recuperação
      </h2>
      <p className="mt-1 mb-4 text-ink-3 text-sm">
        Cada código funciona uma única vez e serve para entrar se você perder o
        celular do autenticador. Eles não serão exibidos de novo.
      </p>
      <ul
        aria-label="Códigos de recuperação"
        className="grid grid-cols-2 gap-2 font-mono text-sm"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button
        type="button"
        variant="accent"
        className="mt-6 w-full"
        onClick={goToPlatform}
      >
        Continuar
      </Button>
    </div>
  );
}
