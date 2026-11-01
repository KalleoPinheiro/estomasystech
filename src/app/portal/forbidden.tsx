import { RouteForbidden } from '@/components/route-states';

export default function Forbidden() {
  return (
    <RouteForbidden home={{ href: '/portal', label: 'Voltar ao portal' }} />
  );
}
