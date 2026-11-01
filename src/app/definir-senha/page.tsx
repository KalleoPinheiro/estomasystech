import { AuthCard } from '@/components/auth-card';
import { ErrorAlert } from '@/components/feedback';
import { MIN_PASSWORD_LENGTH } from '@/domain/auth/password-policy';
import { RequestNewLink, SetPasswordForm } from './set-password-form';

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? '';

  return (
    <AuthCard>
      <h1 className="sv-display font-bold text-xl">Defina sua senha</h1>
      <p className="mt-1 mb-6 text-ink-3 text-sm">
        Pelo menos {MIN_PASSWORD_LENGTH} caracteres e nada de senhas comuns
        (como “senha12345”).
      </p>
      {token ? (
        <SetPasswordForm token={token} />
      ) : (
        <>
          <ErrorAlert message="Link incompleto — abra o link exatamente como veio no e-mail." />
          <RequestNewLink />
        </>
      )}
    </AuthCard>
  );
}
