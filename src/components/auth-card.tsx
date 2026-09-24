/**
 * Moldura das telas públicas (login, esqueci a senha, definir senha). Mobile
 * first: margem lateral de 16px no celular, centralizado na altura da tela.
 * `sv-gradient-border` é a assinatura visual do Still Void — nunca trocada por
 * box-shadow, e cards do sistema não têm sombra.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="sv-gradient-border w-full max-w-sm p-6 sm:p-8">
        {children}
      </div>
    </main>
  );
}
