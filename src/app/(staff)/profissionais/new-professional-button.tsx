'use client';

import { Button } from '@still-void/ui/react';
import { useState } from 'react';
import { Modal } from '@/components/modal';
import { ProfessionalForm } from './professional-form';

/** «+ Novo profissional» do cabeçalho: abre o cadastro; salvar é Server Action. */
export function NewProfessionalButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} variant="accent">
        + Novo profissional
      </Button>
      {open && (
        <Modal title="Novo profissional" onClose={() => setOpen(false)}>
          <ProfessionalForm onSaved={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
