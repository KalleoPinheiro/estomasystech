'use client';

import { Button, FileInput } from '@still-void/ui/react';
import { type ChangeEvent, useRef, useState } from 'react';

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
 * destoa da interface. O `FileInput` do Still Void continua no DOM (escondido, é ele
 * que recebe o arquivo, o foco e o nome acessível); o botão "Escolher arquivo"
 * abre o seletor e o texto ao lado mostra o nome ou "Nenhum arquivo selecionado".
 * O botão sai da ordem de tabulação para não duplicar o campo, mas mostra o foco
 * dele.
 */
export function FilePicker({ onChange, disabled, ...rest }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <FileInput
        ref={inputRef}
        className="peer sr-only"
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
        onClick={() => inputRef.current?.click()}
        className="peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--sv-accent-ink)]"
      >
        Escolher arquivo
      </Button>
      <span className="min-w-0 truncate text-ink-3 text-xs">
        {fileName || 'Nenhum arquivo selecionado'}
      </span>
    </div>
  );
}
