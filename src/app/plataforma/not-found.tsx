import { RouteNotFound } from '@/components/route-states';

export default function NotFound() {
  return (
    <RouteNotFound
      home={{ href: '/plataforma', label: 'Voltar à plataforma' }}
    />
  );
}
