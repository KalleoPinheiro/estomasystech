'use client';

import { Button } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { Modal } from '@/components/modal';
import { unwrapAction } from '@/lib/action-result';
import type { ProcedureDto } from '@/lib/dto';
import { createInvoice } from './billing-actions';
import { InvoiceForm, type InvoiceFormValues } from './invoice-form';
import { PackageForm } from './package-form';

/**
 * Ações do cabeçalho do Faturamento: emitir fatura e vender pacote. Os dois
 * formulários gravam por Server Action; a tela se atualiza sozinha (`refresh()`
 * da própria ação), sem recarregar a lista no navegador.
 */
export function BillingHeaderActions({
  procedures,
}: {
  procedures: ProcedureDto[];
}) {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [sellingPackage, setSellingPackage] = useState(false);

  const handleCreate = async (values: InvoiceFormValues) => {
    // Sem try/catch aqui de propósito: InvoiceForm já envolve este onSubmit
    // no próprio catch (mostra ErrorAlert inline e mantém o modal aberto) —
    // interceptar o erro aqui engoliria essa mensagem antes dela chegar lá.
    await unwrapAction(
      createInvoice({
        patientId: values.patientId,
        description: values.description,
        amountCents: Math.round(Number(values.amount) * 100),
        dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : null,
      }),
    );
    toast({
      description: 'Fatura criada',
      variant: 'success',
    });
    setCreating(false);
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setSellingPackage(true)}
        variant="outline"
        className="text-accent-ink hover:bg-accent-soft"
      >
        Vender pacote
      </Button>
      <Button type="button" onClick={() => setCreating(true)} variant="accent">
        + Nova fatura
      </Button>

      {sellingPackage && (
        <Modal
          title="Vender pacote de sessões"
          onClose={() => setSellingPackage(false)}
        >
          <PackageForm
            procedures={procedures}
            onSaved={() => setSellingPackage(false)}
          />
        </Modal>
      )}

      {creating && (
        <Modal title="Nova fatura" onClose={() => setCreating(false)}>
          <InvoiceForm onSubmit={handleCreate} />
        </Modal>
      )}
    </>
  );
}
