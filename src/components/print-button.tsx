'use client';

import { Button, Icon } from '@still-void/ui/react';
import { ErrorAlert } from '@/components/feedback';
import { useIssuance } from '@/components/issue-document';

/**
 * Barra de ações do documento (some na impressão): Voltar e Imprimir. Só imprime
 * com a emissão persistida (#94, DOC-01): antes dela o rodapé ainda não tem
 * número nem data. Falha de emissão aparece aqui e nunca imprime sem número.
 */
export function DocumentActions() {
  const state = useIssuance();
  return (
    <div className="mb-6 border-border border-b pb-4 print:hidden">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="link"
          onClick={() => window.history.back()}
        >
          <Icon name="chevron-left" /> Voltar
        </Button>
        <Button
          type="button"
          disabled={state.status === 'pending' || state.status === 'error'}
          onClick={() => window.print()}
        >
          Imprimir / salvar PDF
        </Button>
      </div>
      {state.status === 'error' && (
        <div className="mt-4">
          <ErrorAlert message={state.message} />
        </div>
      )}
    </div>
  );
}
