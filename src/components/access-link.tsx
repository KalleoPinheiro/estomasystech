'use client';

import { Button, Input } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';

/**
 * Link de convite ou de redefinição de senha para quem o gerou repassar à mão
 * (C2, #265) — aparece só quando o e-mail não saiu. O link é uma credencial
 * de uso único: fica num campo somente leitura, nunca num texto livre.
 */
export function AccessLinkField({
  url,
  label = 'Link de acesso',
}: {
  url: string;
  label?: string;
}) {
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ description: 'Link copiado', variant: 'success' });
    } catch {
      toast({
        description: 'Não foi possível copiar — selecione o link e copie.',
        variant: 'danger',
      });
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex-1 font-medium text-sm">
        {label}
        <Input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-1 font-mono text-xs"
        />
      </label>
      <Button type="button" variant="accent" onClick={() => void copy()}>
        Copiar link
      </Button>
    </div>
  );
}
