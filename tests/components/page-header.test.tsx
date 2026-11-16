// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from '@/components/page-header';

afterEach(() => {
  cleanup();
});

describe('Feature: Cabeçalho de página', () => {
  it('um h1 e o grupo de ações', () => {
    const { container } = render(
      <PageHeader
        title="Pacientes"
        description="Cadastro e prontuário"
        actions={<button type="button">+ Novo paciente</button>}
      />,
    );
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Pacientes');
    const header = container.querySelector('[data-page-header]');
    expect(header).not.toBeNull();
    const actions = container.querySelector('[data-page-header-actions]');
    expect(actions).not.toBeNull();
    expect(actions).toContainElement(
      screen.getByRole('button', { name: '+ Novo paciente' }),
    );
    expect(actions).not.toContainElement(headings[0]);
    expect(screen.getByText('Cadastro e prontuário')).toBeInTheDocument();
  });

  it('sem ações não renderiza o grupo vazio', () => {
    const { container } = render(<PageHeader title="Dashboard" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelector('[data-page-header-actions]')).toBeNull();
  });

  it('badge e contexto acompanham o título', () => {
    render(
      <PageHeader
        title="Maria"
        badge={<span>Ativo</span>}
        leading={<a href="/pacientes">Pacientes</a>}
      />,
    );
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pacientes' })).toBeInTheDocument();
  });

  it('o selo não troca de linha com o título (a troca de fonte não pode fazer a tela saltar)', () => {
    const { container } = render(
      <PageHeader title="Paciente Vinculado E2E" badge={<span>Ativo</span>} />,
    );
    const linha = screen.getByRole('heading', { level: 1 }).parentElement;
    expect(linha).not.toBeNull();
    expect(linha?.className).not.toContain('flex-wrap');
    expect(container.querySelector('h1')?.className).toContain('min-w-0');
  });
});

describe('Feature: Selo largo abaixo do título no celular (#884)', () => {
  it('com stackBadge o selo desce no celular e fica ao lado a partir de sm, sem flex-wrap', () => {
    render(
      <PageHeader
        title="Clínica Homologação (fictícia)"
        badge={<span>Cadastro completo</span>}
        stackBadge
      />,
    );
    const linha = screen.getByRole('heading', { level: 1 }).parentElement;
    expect(linha?.className).toContain('flex-col');
    expect(linha?.className).toContain('sm:flex-row');
    expect(linha?.className).not.toContain('flex-wrap');
    expect(
      screen.getByText('Cadastro completo').parentElement?.className,
    ).toContain('flex-wrap');
  });

  it('sem stackBadge o selo continua ao lado do título', () => {
    render(<PageHeader title="Maria" badge={<span>Ativo</span>} />);
    const linha = screen.getByRole('heading', { level: 1 }).parentElement;
    expect(linha?.className).not.toContain('flex-col');
  });
});
