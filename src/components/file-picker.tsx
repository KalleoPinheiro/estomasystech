'use client';

import { Button, FileInput } from '@still-void/ui/react';
import { type ChangeEvent, useState } from 'react';

interface FilePickerProps {
  accept?: string;
  disabled?: boolean;
  /** Nome acessível do campo de arquivo (o botão visível é só a afordância de toque). */
  'aria-label'?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Seletor de arquivo em português (#518). O controle nativo do `<input
 * type="file">` escreve "Choose File · No file chosen" no idioma do navegador, que
 * destoa da interface. O `FileInput` do Still Void continua sendo o campo de verdade
 * (recebe o clique, o foco, o arquivo e o nome acessível), só que transparente e
 * esticado sobre o botão «Escolher arquivo»: o alvo de toque medido é o próprio
 * campo, com a área do botão (44px no celular). O texto ao lado mostra o nome ou
 * «Nenhum arquivo selecionado».
 */
export function FilePicker({ onChange, disabled, ...rest }: FilePickerProps) {
  const [fileName, setFileName] = useState('');

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="relative inline-flex">
        <FileInput
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
          disabled={disabled}
          onChange={(event) => {
            setFileName(event.target.files?.[0]?.name ?? '');
            onChange(event);
          }}
          {...rest}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          className="pointer-events-none min-h-11 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--sv-accent-ink)]"
        >
          Escolher arquivo
        </Button>
      </span>
      <span className="min-w-0 truncate text-ink-3 text-xs">
        {fileName || 'Nenhum arquivo selecionado'}
      </span>
    </div>
  );
}
