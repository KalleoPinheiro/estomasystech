'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@still-void/ui/react/client';
import type { ReactNode } from 'react';

interface ConfirmActionProps {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  variant?: 'default' | 'danger' | 'success';
}

/**
 * Encapsula o `AlertDialog` do Still Void como confirmação padrão para ações
 * destrutivas/irreversíveis (issue #59): um único componente evita 12
 * implementações divergentes de copy/estrutura pelas páginas.
 *
 * `trigger` é passado com `asChild` ao `AlertDialogTrigger` — o elemento
 * recebido (ex.: `<Button>`) vira o próprio disparador do dialog, sem duplicar
 * markup de botão.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onConfirm,
  variant = 'default',
}: ConfirmActionProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm()}
            className={
              variant === 'danger'
                ? 'bg-danger text-white hover:bg-danger/90'
                : variant === 'success'
                  ? 'bg-success text-white hover:bg-success/90'
                  : undefined
            }
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
