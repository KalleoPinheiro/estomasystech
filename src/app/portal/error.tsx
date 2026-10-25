'use client';

import { RouteError } from '@/components/route-states';

export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <RouteError
      error={error}
      retry={retry}
      home={{ href: '/portal', label: 'Voltar ao portal' }}
    />
  );
}
