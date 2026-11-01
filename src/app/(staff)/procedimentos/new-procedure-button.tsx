'use client';

import { Button } from '@still-void/ui/react';
import { useState } from 'react';
import { Modal } from '@/components/modal';
import { ProcedureForm } from './procedure-form';

/** «+ Novo procedimento» do cabeçalho: abre o cadastro; salvar é Server Action. */
export function NewProcedureButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} variant="accent">
        + Novo procedimento
      </Button>
      {open && (
        <Modal title="Novo procedimento" onClose={() => setOpen(false)}>
          <ProcedureForm onSaved={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
