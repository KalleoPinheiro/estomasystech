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
});
