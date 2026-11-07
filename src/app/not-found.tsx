import { Card } from '@still-void/ui/react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';

/**
 * 404 global (#656): endereço que não casa com nenhuma rota. Sem este arquivo o Next serve a
 * 404 padrão, cujo `<style>` inline não recebe o nonce e viola a CSP (`style-src-elem`).
 * Fica fora dos grupos de rotas, então não depende de sessão nem do menu da equipe.
 */
export default function NotFound() {
  return (
    <main
      data-route-state="not-found"
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-8"
    >
      <PageHeader
        title="Página não encontrada"
        description="Não encontramos o endereço que você abriu. Ele pode ter sido digitado errado ou removido."
      />
      <Card className="p-5">
        <p className="font-medium">
          Sem problema: você pode voltar ao início e continuar de lá.
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex min-h-11 items-center font-medium text-accent-ink text-sm hover:underline"
        >
          Voltar ao início
        </Link>
      </Card>
    </main>
  );
}
