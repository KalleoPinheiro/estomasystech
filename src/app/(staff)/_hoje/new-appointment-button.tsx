'use client';

import { Button } from '@still-void/ui/react';
import { useRouter } from 'next/navigation';
import { useHydrated } from '@/components/app-shell/use-hydrated';
import { NEW_APPOINTMENT_HREF } from '../agenda/agenda-range';

/**
 * Atalho da tela Hoje para a nova consulta (#973): abre a agenda já com o
 * formulário aberto. Desabilitado até hidratar, como o botão da agenda (#484),
 * para o clique não se perder.
 */
export function NewAppointmentButton() {
  const router = useRouter();
  const hydrated = useHydrated();
  return (
    <Button
      type="button"
      variant="accent"
      disabled={!hydrated}
      onClick={() => router.push(NEW_APPOINTMENT_HREF)}
    >
      + Novo agendamento
    </Button>
  );
}
