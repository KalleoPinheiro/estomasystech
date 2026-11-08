'use client';

import { Button } from '@still-void/ui/react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Rede fora ou sessão já vencida: sair não pode travar na tela. O cookie
      // vencido não vale mais e o proxy leva ao login de qualquer forma (#718).
    }
    router.push('/login');
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="self-start"
      onClick={() => void handleLogout()}
    >
      Sair
    </Button>
  );
}
