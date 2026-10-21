'use client';

import { Button, Card } from '@still-void/ui/react';
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  useMediaQuery,
} from '@still-void/ui/react/client';

interface SheetPanelProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Ficha de uma tela lista + ficha. No computador fica ao lado da lista; no
 * celular sobe como folha de baixo (`BottomSheet`), em vez de empilhar abaixo
 * da lista onde a pessoa nem a vê abrir.
 *
 * A consulta é `max-width` de propósito: sem `matchMedia` (SSR, testes) o
 * `useMediaQuery` responde `false`, e o padrão seguro é a ficha ao lado.
 */
export function SheetPanel({ title, onClose, children }: SheetPanelProps) {
  const isMobile = useMediaQuery('(max-width: 1023px)');

  if (isMobile) {
    return (
      <BottomSheet
        open
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
      >
        <BottomSheetContent closeLabel="Cancelar">
          <BottomSheetHeader>
            <BottomSheetTitle>{title}</BottomSheetTitle>
          </BottomSheetHeader>
          <BottomSheetBody>{children}</BottomSheetBody>
        </BottomSheetContent>
      </BottomSheet>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">{title}</h2>
        <Button type="button" onClick={onClose} variant="ghost" size="sm">
          Fechar ficha
        </Button>
      </div>
      {children}
    </Card>
  );
}
