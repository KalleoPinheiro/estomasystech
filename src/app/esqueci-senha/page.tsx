'use client';

import { Button, Input } from '@still-void/ui/react';
import Link from 'next/link';
import { useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';

/**
 * Mensagem deliberadamente neutra: a mesma para conta existente e inexistente,
 * espelhando a resposta da API (AUTH-11). Dizer "enviamos para você" revelaria
 * que o endereço está cadastrado.
 */
const NEUTRAL_CONFIRMATION =
  'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar o link');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard>
      <h1 className="sv-display font-bold text-xl">Esqueci minha senha</h1>
      <p className="mt-1 mb-6 text-ink-3 text-sm">
        Informe seu e-mail e enviaremos um link para definir uma nova senha.
      </p>
      {sent ? (
        <p className="text-sm">{NEUTRAL_CONFIRMATION}</p>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <ErrorAlert message={error} />}
          <label className="font-medium text-sm">
            E-mail
            <Input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="mt-1"
            />
          </label>
          <Button
            type="submit"
            disabled={submitting}
            variant="accent"
            className="mt-4 w-full"
          >
            {submitting ? 'Enviando…' : 'Enviar link'}
          </Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-accent-ink hover:underline">
          Voltar para o login
        </Link>
      </p>
    </AuthCard>
  );
}
