import { RouteLoading } from '@/components/route-states';

/**
 * O layout do portal (aviso de urgência, privacidade, versão) chega antes do
 * conteúdo. A altura de uma tela mantém o rodapé abaixo da dobra enquanto o
 * conteúdo chega: ele desce junto com o conteúdo fora da vista, e nada visível
 * se mexe (#553, sem salto de layout no celular).
 */
export default function Loading() {
  return (
    <div className="min-h-svh">
      <RouteLoading />
    </div>
  );
}
