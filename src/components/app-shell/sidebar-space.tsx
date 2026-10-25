'use client';

import { useSidebar } from '@still-void/ui/react/client';

/**
 * Reserva o lugar do menu lateral antes da hidratação (CLS, #544). O
 * `SidebarProvider` do Still Void decide "celular ou desktop" por `matchMedia`,
 * que no servidor e na primeira renderização vale "celular": o menu só aparece
 * depois, e o conteúdo salta 224 px para a direita (CLS ~0,18 em todo desktop).
 * Enquanto o provider ainda diz "celular", este espaço (visível só a partir de
 * `lg`, o mesmo ponto de corte do provider, 1024 px) ocupa a largura do menu
 * (`w-56`, a mesma do `SidebarPanel`); quando o menu entra, o espaço sai e nada
 * se move. Abaixo de `lg` ele é invisível.
 */
export function SidebarSpace() {
  const { isMobile } = useSidebar();
  if (!isMobile) return null;
  return <div aria-hidden="true" className="hidden w-56 shrink-0 lg:block" />;
}
