// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilePicker } from '@/components/file-picker';

describe('Feature: seletor de arquivo em português (#518)', () => {
  it('Dado nenhum arquivo escolhido, Quando renderiza, Então mostra o botão e o estado vazio em português', () => {
    render(<FilePicker aria-label="Enviar foto" onChange={vi.fn()} />);

    expect(screen.getByText('Escolher arquivo')).toBeInTheDocument();
    expect(screen.getByText('Nenhum arquivo selecionado')).toBeInTheDocument();
    expect(screen.queryByText(/choose file|no file chosen/i)).toBeNull();
  });

  it('Dado um arquivo escolhido, Quando muda, Então mostra o nome e repassa o evento', () => {
    const onChange = vi.fn();
    render(<FilePicker aria-label="Enviar foto" onChange={onChange} />);
    const file = new File(['x'], 'ferida.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText('Enviar foto'), {
      target: { files: [file] },
    });

    expect(screen.getByText('ferida.png')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('Dado a escolha limpa, Quando muda sem arquivo, Então volta ao estado vazio', () => {
    render(<FilePicker aria-label="Enviar foto" onChange={vi.fn()} />);
    const input = screen.getByLabelText('Enviar foto');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] },
    });
    fireEvent.change(input, { target: { files: [] } });

    expect(screen.getByText('Nenhum arquivo selecionado')).toBeInTheDocument();
  });

  it('Dado o campo desabilitado, Então o botão também fica desabilitado', () => {
    render(<FilePicker disabled aria-label="Enviar foto" onChange={vi.fn()} />);

    expect(screen.getByText('Escolher arquivo')).toBeDisabled();
  });
});
