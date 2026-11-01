'use client';

import { Button } from '@still-void/ui/react';
import { useState } from 'react';
import { Modal } from '@/components/modal';
import { PartnerForm } from './partner-form';

/** «+ Novo parceiro» do cabeçalho: abre o cadastro; salvar é Server Action. */
export function NewPartnerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} variant="accent">
        + Novo parceiro
      </Button>
      {open && (
        <Modal title="Novo parceiro" onClose={() => setOpen(false)}>
          <PartnerForm onSaved={() => setOpen(false)} />
        </Modal>
      )}
    </>
  );
}
