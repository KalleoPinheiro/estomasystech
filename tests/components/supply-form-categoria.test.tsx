// @vitest-environment jsdom

import { ToastProvider } from '@still-void/ui/react/client';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupplyForm } from '@/app/(staff)/materiais/supply-form';
import type { SupplyDto } from '@/lib/dto';

const mocks = vi.hoisted(() => ({
  createSupply: vi.fn(),
  updateSupply: vi.fn(),
}));
vi.mock('@/app/(staff)/materiais/supply-actions', () => mocks);

const done = { success: true, data: {}, error: null };

const existing: SupplyDto = {
  id: 's-1',
  name: 'Alginato',
  unit: 'un',
  minQty: 0,
  priceCents: 2000,
  category: 'cobertura',
  stockQty: 0,
  isLowStock: false,
  isOutOfStock: true,
  active: true,
};

const renderForm = (initial?: SupplyDto) =>
  render(
    <ToastProvider>
      <SupplyForm initial={initial} onSaved={vi.fn()} />
    </ToastProvider>,
  );

afterEach(() => {
  cleanup();
  mocks.createSupply.mockReset();
  mocks.updateSupply.mockReset();
});

describe('Feature: categoria no formulário do insumo (#963 D2)', () => {
  it('cadastra com a categoria escolhida', async () => {
    mocks.createSupply.mockResolvedValue(done);
    renderForm();
    fireEvent.change(screen.getByLabelText(/Nome/), {
      target: { value: 'Soro fisiológico' },
    });
    fireEvent.change(screen.getByLabelText(/Preço/), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByLabelText('Categoria'), {
      target: { value: 'solucao' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(mocks.createSupply).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Soro fisiológico',
          category: 'solucao',
        }),
      ),
    );
  });

  it('edição mostra a categoria atual e "Sem categoria" a limpa', async () => {
    mocks.updateSupply.mockResolvedValue(done);
    renderForm(existing);
    const select = screen.getByLabelText('Categoria') as HTMLSelectElement;
    expect(select.value).toBe('cobertura');
    expect(screen.getByRole('option', { name: 'Sem categoria' })).toBeTruthy();

    fireEvent.change(select, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(mocks.updateSupply).toHaveBeenCalledWith(
        expect.objectContaining({ id: 's-1', category: null }),
      ),
    );
  });
});
