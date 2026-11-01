import { AuthCard } from '@/components/auth-card';
import { ForgotPasswordForm } from './forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <AuthCard>
      <h1 className="sv-display font-bold text-xl">Esqueci minha senha</h1>
      <p className="mt-1 mb-6 text-ink-3 text-sm">
        Informe seu e-mail e enviaremos um link para definir uma nova senha.
      </p>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
