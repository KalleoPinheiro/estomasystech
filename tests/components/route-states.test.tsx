// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StaffError from '@/app/(staff)/error';
import StaffForbidden from '@/app/(staff)/forbidden';
import StaffLoading from '@/app/(staff)/loading';
import StaffNotFound from '@/app/(staff)/not-found';
import DocumentosError from '@/app/documentos/error';
import DocumentosForbidden from '@/app/documentos/forbidden';
import DocumentosLoading from '@/app/documentos/loading';
import DocumentosNotFound from '@/app/documentos/not-found';
import PlataformaError from '@/app/plataforma/error';
import PlataformaForbidden from '@/app/plataforma/forbidden';
import PlataformaLoading from '@/app/plataforma/loading';
import PlataformaNotFound from '@/app/plataforma/not-found';
import PortalError from '@/app/portal/error';
import PortalForbidden from '@/app/portal/forbidden';
import PortalLoading from '@/app/portal/loading';
import PortalNotFound from '@/app/portal/not-found';

afterEach(cleanup);

const GROUPS = [
  {
    nome: 'equipe',
    error: StaffError,
    forbidden: StaffForbidden,
    notFound: StaffNotFound,
    loading: StaffLoading,
    href: '/',
  },
  {
    nome: 'portal',
    error: PortalError,
    forbidden: PortalForbidden,
    notFound: PortalNotFound,
    loading: PortalLoading,
    href: '/portal',
  },
  {
    nome: 'plataforma',
    error: PlataformaError,
    forbidden: PlataformaForbidden,
    notFound: PlataformaNotFound,
    loading: PlataformaLoading,
    href: '/plataforma',
  },
  {
    nome: 'documentos',
    error: DocumentosError,
    forbidden: DocumentosForbidden,
    notFound: DocumentosNotFound,
    loading: DocumentosLoading,
    href: '/',
  },
];

describe.each(GROUPS)(
  'Feature: estados de rota do grupo $nome (ADR-069 § 1)',
  ({
    error: ErrorPage,
    forbidden: Forbidden,
    notFound: NotFound,
    loading: Loading,
    href,
  }) => {
    it('Dada a busca em andamento, Então mostra o esqueleto com rótulo acessível', () => {
      render(<Loading />);

      expect(screen.getByText('Carregando…')).toBeInTheDocument();
    });

    it('Dado erro no servidor, Quando a tela cai, Então mostra mensagem fixa (nunca a do erro), o código e tenta de novo', () => {
      const retry = vi.fn();
      const error = Object.assign(new Error('select cpf from patients'), {
        digest: 'abc123',
      });
      render(<ErrorPage error={error} retry={retry} />);

      expect(screen.getByRole('alert')).toHaveTextContent('código abc123');
      expect(screen.queryByText(/select cpf/)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      expect(retry).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('link')).toHaveAttribute('href', href);
    });

    it('Dado erro sem código, Quando a tela cai, Então a mensagem não cita código', () => {
      render(<ErrorPage error="falha" retry={vi.fn()} />);

      expect(screen.getByRole('alert')).not.toHaveTextContent('código');
    });

    it('Dada rota inexistente, Então mostra «Página não encontrada» com o caminho de volta', () => {
      render(<NotFound />);

      expect(
        screen.getByRole('heading', { name: 'Página não encontrada' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link')).toHaveAttribute('href', href);
    });

    it('Dado papel sem acesso, Então mostra «Acesso negado» com o caminho de volta', () => {
      render(<Forbidden />);

      expect(
        screen.getByRole('heading', { name: 'Acesso negado' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link')).toHaveAttribute('href', href);
    });
  },
);

describe('Feature: código do erro', () => {
  it('Dado erro nulo, Quando a tela cai, Então não quebra ao procurar o código', () => {
    render(<StaffError error={null} retry={vi.fn()} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
