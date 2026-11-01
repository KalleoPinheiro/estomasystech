// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentFrame } from '@/components/document-frame';
import type { ActionResult } from '@/lib/action-result';

const issueDocument = vi.hoisted(() => vi.fn());
vi.mock('@/app/documentos/actions', () => ({ issueDocument }));

const CLINIC = {
  name: 'Clínica Aurora',
  cnpj: '12.345.678/0001-95',
  address: null,
  city: 'São Paulo',
  professionalName: 'Enf. Ana',
  professionalRegistry: 'COREN-SP 1',
};

const issued = (): ActionResult<unknown> => ({
  success: true,
  data: {
    documentNumber: 'ATST-0A1B2C3D',
    issuedAt: '2026-09-04T02:30:00.000Z',
  },
  error: null,
});

const frame = (props: Record<string, unknown> = {}) => (
  <StrictMode>
    <DocumentFrame
      clinic={CLINIC}
      title="Atestado"
      issue={{ documentType: 'atestado', resourceId: 'apt-1' }}
      {...props}
    >
      <p>Corpo</p>
    </DocumentFrame>
  </StrictMode>
);

const printButton = () =>
  screen.getByRole('button', { name: 'Imprimir / salvar PDF' });

beforeEach(() => {
  issueDocument.mockReset();
  vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('Feature: ilha de emissão do documento impresso (#546, ADR-082)', () => {
  it('Dada a página recém-aberta, Quando a ilha monta (inclusive no modo estrito), Então emite UMA vez e mostra número e data', async () => {
    issueDocument.mockResolvedValue(issued());

    await act(async () => {
      render(frame());
    });

    expect(issueDocument).toHaveBeenCalledTimes(1);
    expect(issueDocument).toHaveBeenCalledWith({
      documentType: 'atestado',
      resourceId: 'apt-1',
    });
    expect(screen.getByText(/Documento nº ATST-0A1B2C3D/)).toBeInTheDocument();
    expect(
      screen.getByText(/São Paulo, 03 de setembro de 2026, 23:30\./),
    ).toBeInTheDocument();
    expect(printButton()).toBeEnabled();
  });

  it('Dada a emissão em andamento, Quando a página aparece, Então o lugar do número já está reservado e o Imprimir fica desligado', () => {
    issueDocument.mockReturnValue(new Promise(() => undefined));

    render(frame());

    expect(printButton()).toBeDisabled();
    const footnote = screen.getByText(/Documento nº/);
    expect(footnote).toHaveClass('invisible');
    expect(footnote).toHaveAttribute('aria-busy', 'true');
  });

  it('Dado documento já emitido (reimpressão), Quando a página abre, Então mostra o número sem chamar a emissão', async () => {
    await act(async () => {
      render(
        frame({
          documentNumber: 'ATST-FFFF0000',
          issuedAt: '2026-09-04T02:30:00.000Z',
        }),
      );
    });

    expect(issueDocument).not.toHaveBeenCalled();
    expect(screen.getByText(/Documento nº ATST-FFFF0000/)).toBeInTheDocument();
    expect(printButton()).toBeEnabled();
  });

  it('Dada a página sem documento a emitir, Quando monta, Então não chama a emissão e não imprime', () => {
    render(frame({ issue: undefined }));

    expect(issueDocument).not.toHaveBeenCalled();
    expect(printButton()).toBeDisabled();
  });

  it('Dada a emissão recusada pelo servidor, Quando responde, Então mostra o motivo e não deixa imprimir', async () => {
    issueDocument.mockResolvedValue({
      success: false,
      data: null,
      error: 'O paciente não tem CPF cadastrado.',
    });

    await act(async () => {
      render(frame());
    });

    expect(
      screen.getByText('O paciente não tem CPF cadastrado.'),
    ).toBeInTheDocument();
    expect(printButton()).toBeDisabled();
    expect(screen.getByText(/Documento nº/)).toHaveClass('invisible');
  });

  it('Dada falha que não é um Error, Quando a emissão rejeita, Então mostra a mensagem padrão', async () => {
    issueDocument.mockRejectedValue('queda de rede');

    await act(async () => {
      render(frame());
    });

    expect(screen.getByText('Erro ao emitir documento')).toBeInTheDocument();
  });

  it('Dada emissão concluída, Quando clicar em Imprimir, Então chama window.print', async () => {
    issueDocument.mockResolvedValue(issued());
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    await act(async () => {
      render(frame());
    });
    fireEvent.click(printButton());

    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });
});
