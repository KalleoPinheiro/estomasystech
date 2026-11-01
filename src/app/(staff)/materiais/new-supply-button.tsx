'use client';

import { Button } from '@still-void/ui/react';
import { useState } from 'react';
import { Modal } from '@/components/modal';
import { SupplyForm } from './supply-form';

/** «+ Novo insumo» do cabeçalho: abre o cadastro; salvar é Server Action. */
export function NewSupplyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} variant="accent">
        + Novo insumo
      </Button>
      {open && (
        <Modal title="Novo insumo" onClose={() => setOpen(false)}>
          <SupplyForm onSaved={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
