// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ClinicStatementsTable,
  PayoutItemsTable,
} from '@/app/(staff)/repasses/payout-tables';

afterEach(() => {
  cleanup();
});

/** Layout mobile-first, AC 16: o vazio das tabelas de repasse continua o mesmo. */
describe('Feature: tabelas de repasse sem registros', () => {
  it('extrato da clínica sem profissionais mostra o vazio atual', () => {
    render(
      <ClinicStatementsTable rows={[]} canClose={false} onClose={() => {}} />,
    );
    expect(
      screen.getByText('Nenhum profissional cadastrado.'),
    ).toBeInTheDocument();
    expect(document.querySelector('table')).toBeNull();
  });

  it('itens do repasse sem sessões mostram o vazio atual', () => {
    render(<PayoutItemsTable items={[]} />);
    expect(screen.getByText('Nenhuma sessão.')).toBeInTheDocument();
    expect(document.querySelector('table')).toBeNull();
  });
});
