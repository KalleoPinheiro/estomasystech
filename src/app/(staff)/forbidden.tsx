import { RouteForbidden } from '@/components/route-states';

export default function Forbidden() {
  return <RouteForbidden home={{ href: '/', label: 'Voltar ao início' }} />;
}
