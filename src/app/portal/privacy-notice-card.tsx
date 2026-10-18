'use client';

import { Button, Card, Prose } from '@still-void/ui/react';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { useApiQuery } from '@/lib/use-api-query';

/**
 * Aviso de privacidade da clínica (LGPD, art. 9º; #216): fechado por padrão,
 * com o CNPJ e o encarregado dela. Fica acima dos termos porque o TCLE
 * declara que o aviso foi apresentado antes do aceite.
 */
export function PrivacyNoticeCard() {
  const [open, setOpen] = useState(false);
  const { data, error } = useApiQuery<{ version: string; text: string }>(
    open ? '/api/portal/privacy-notice' : null,
  );

  return (
    <Card as="section" className="p-4" data-privacy-notice>
      <h2 className="mb-2 font-semibold text-sm">Aviso de privacidade</h2>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Ocultar o aviso' : 'Ler o aviso de privacidade'}
      </Button>
      {open && error && <ErrorAlert message={error} />}
      {open && data && (
        <Prose className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-warning-soft bg-sv-surface p-3 text-sm">
          {data.text}
        </Prose>
      )}
    </Card>
  );
}
