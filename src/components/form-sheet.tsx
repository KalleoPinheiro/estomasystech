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
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  useMediaQuery,
} from '@still-void/ui/react/client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/modal';

interface FormSheetProps {
  title: string;
  onClose: () => void;
  /** Há dado digitado que se perde ao sair; no celular, fechar pede confirmação. */
  dirty: boolean;
  /** Pergunta de confirmação ao fechar com dado digitado (padrão: "Descartar alterações?"). */
  discardTitle?: string;
  /**
   * O formulário inteiro, com o próprio rodapé de ação: no celular ele ocupa a
   * altura da folha (`flex-1`) e o rodapé fica fixo embaixo, fora da rolagem.
   */
  children: React.ReactNode;
}

/**
 * Formulário longo em janela: no computador é o `Modal` de sempre; no celular
 * (< 768px) vira folha de tela cheia (`BottomSheet`) com cabeçalho fixo, corpo
 * rolável e rodapé fixo, para a ação principal nunca sumir na rolagem (#523).
 * Uso à beira do leito: um toque fora do lugar não pode perder o que foi
 * digitado, então fechar a folha com dado preenchido pede confirmação.
 *
 * O foco volta ao gatilho por um efeito próprio, como no `Modal`: o pai
 * desmonta a janela direto, e a Radix não vê a transição `open → false`.
 *
 * A consulta é `max-width` de propósito: sem `matchMedia` (SSR, testes) o
 * `useMediaQuery` responde `false`, e o padrão seguro é o `Modal`.
 */
export function FormSheet({
  title,
  onClose,
  dirty,
  discardTitle = 'Descartar alterações?',
  children,
}: FormSheetProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [confirming, setConfirming] = useState(false);
  const [previouslyFocused] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined'
      ? null
      : (document.activeElement as HTMLElement | null),
  );

  useEffect(() => {
    return () => {
      previouslyFocused?.focus();
    };
  }, [previouslyFocused]);

  if (!isMobile) {
    return (
      <Modal title={title} onClose={onClose}>
        {children}
      </Modal>
    );
  }

  const requestClose = () => (dirty ? setConfirming(true) : onClose());

  return (
    <>
      <BottomSheet
        open
        onOpenChange={(open) => {
          if (!open) {
            requestClose();
          }
        }}
      >
        <BottomSheetContent
          closeLabel="Cancelar"
          // Tela cheia: a folha da lib para em 90dvh e deixa a página aparecer;
          // `!` porque o CSS da lib não está em camada e vence os utilitários.
          className="h-dvh! max-h-dvh! rounded-none! border-0!"
        >
          <BottomSheetHeader>
            <BottomSheetTitle>{title}</BottomSheetTitle>
          </BottomSheetHeader>
          {children}
        </BottomSheetContent>
      </BottomSheet>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{discardTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              O que foi preenchido não foi salvo e será perdido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
