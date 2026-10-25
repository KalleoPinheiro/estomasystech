'use client';

import { Alert, AlertDescription, Button, Card } from '@still-void/ui/react';
import Link from 'next/link';
import { LoadingIndicator } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';

/** Para onde cada grupo de rotas leva quem não tem o que ver ali. */
export interface RouteHome {
  href: string;
  label: string;
}

/** `loading.tsx` dos grupos de rotas: o esqueleto do Still Void enquanto o servidor responde. */
export function RouteLoading() {
  return <LoadingIndicator />;
}

/** Código curto do erro de servidor, para casar com a linha do log (o texto vem genérico em produção). */
function errorDigest(error: unknown): string | null {
  const digest =
    typeof error === 'object' && error !== null
      ? (error as { digest?: unknown }).digest
      : undefined;
  return typeof digest === 'string' ? digest : null;
}

/** `error.tsx` dos grupos de rotas: mensagem fixa (nunca a do erro, que pode ter dado) e nova tentativa. */
export function RouteError({
  error,
  retry,
  home,
}: {
  error: unknown;
  retry: () => void;
  home: RouteHome;
}) {
  const digest = errorDigest(error);
  return (
    <div data-route-error>
      <PageHeader title="Algo deu errado" />
      <Alert variant="danger" className="mb-4">
        <AlertDescription>
          Não foi possível carregar esta tela. Tente novamente; se continuar,
          avise o suporte
          {digest ? ` informando o código ${digest}` : ''}.
        </AlertDescription>
        <Button
          type="button"
          variant="link"
          className="mt-1 h-auto p-0"
          onClick={retry}
        >
          Tentar novamente
        </Button>
      </Alert>
      <Link
        href={home.href}
        className="font-medium text-accent-ink text-sm hover:underline"
      >
        {home.label}
      </Link>
    </div>
  );
}

function RouteMessage({
  title,
  message,
  home,
  state,
}: {
  title: string;
  message: string;
  home: RouteHome;
  state: 'not-found' | 'forbidden';
}) {
  return (
    <div data-route-state={state}>
      <PageHeader title={title} />
      <Card className="p-5">
        <p className="font-medium">{message}</p>
        <Link
          href={home.href}
          className="mt-3 inline-flex font-medium text-accent-ink text-sm hover:underline"
        >
          {home.label}
        </Link>
      </Card>
    </div>
  );
}

/** `not-found.tsx` dos grupos de rotas. */
export function RouteNotFound({ home }: { home: RouteHome }) {
  return (
    <RouteMessage
      title="Página não encontrada"
      message="Este endereço não existe ou foi removido."
      home={home}
      state="not-found"
    />
  );
}

/** `forbidden.tsx` dos grupos de rotas (403 das guardas de página). */
export function RouteForbidden({ home }: { home: RouteHome }) {
  return (
    <RouteMessage
      title="Acesso negado"
      message="Seu papel não tem acesso a esta tela."
      home={home}
      state="forbidden"
    />
  );
}
