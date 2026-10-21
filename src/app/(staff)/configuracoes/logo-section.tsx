'use client';

import { Card } from '@still-void/ui/react';
import { useState } from 'react';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { IdentityImageField } from '@/components/identity-image-field';
import type { ClinicRegistrationDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';

const UNAVAILABLE =
  'O envio de imagens está indisponível neste ambiente (armazenamento não configurado). As demais configurações seguem funcionando.';

/**
 * Logo da clínica (#427): aparece no menu da equipe no lugar das iniciais. Só o
 * Admin de Empresa edita; o texto alternativo da logo é o nome da clínica.
 */
export function LogoSection() {
  const { data, error } = useApiQuery<{
    info: ClinicRegistrationDto;
    identity?: { logoUrl: string | null; imageUploadAvailable: boolean };
  }>('/api/settings/clinic-info');
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingIndicator />;
  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Logo da clínica</h2>
      <p className="mb-4 text-ink-3 text-sm">
        Aparece no menu da equipe. Sem logo, o sistema mostra as iniciais da
        clínica.
      </p>
      <IdentityImageField
        kind="logo"
        endpoint="/api/settings/clinic-logo"
        name={data.info.name}
        url={url === undefined ? data.identity?.logoUrl : url}
        onChanged={setUrl}
        disabledReason={
          data.identity?.imageUploadAvailable === false
            ? UNAVAILABLE
            : undefined
        }
      />
    </Card>
  );
}
