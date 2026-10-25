import { RouteForbidden } from '@/components/route-states';

export default function Forbidden() {
  return (
    <RouteForbidden
      home={{ href: '/plataforma', label: 'Voltar à plataforma' }}
    />
  );
}
