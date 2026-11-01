import { BrandMark } from '@/components/brand-mark';
import { getAuthConfig } from '@/lib/auth/session';
import { LoginCard } from './login-card';
import { type LoginSearchParams, resolveLoginState } from './login-state';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  const state = resolveLoginState(await searchParams, getAuthConfig() !== null);
  return (
    <LoginShell>
      <LoginCard {...state} />
    </LoginShell>
  );
}

/**
 * Moldura do login: no computador, painel da marca à esquerda e formulário à
 * direita; no celular, só o formulário. A marca é a do produto: o login ainda
 * não sabe a clínica de quem entra (logo e nome da clínica aparecem depois).
 */
function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh">
      <div
        aria-hidden="true"
        className="hidden flex-1 flex-col justify-center gap-3 bg-sv-surface px-16 md:flex"
      >
        <BrandMark size={72} />
        <p className="sv-display font-bold text-3xl">EstomaSysTech</p>
        <p className="max-w-sm text-ink-3">
          Agenda, prontuário e acompanhamento de feridas e estomias em um só
          lugar.
        </p>
      </div>
      <div className="flex w-full items-center justify-center px-4 py-10 md:max-w-xl md:px-12">
        <div className="sv-gradient-border w-full max-w-sm p-6 sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
