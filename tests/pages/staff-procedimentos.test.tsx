// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProceduresPage from '@/app/(staff)/procedimentos/page';
import { ValidationError } from '@/domain/shared/errors';
import type { ProcedureDto, SupplyDto } from '@/lib/dto';
import { actionError, procedures as data } from '../support/procedures-data';
import { renderServerPage } from '../support/server-page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/procedimentos',
}));
vi.mock('@/lib/server/session', async () => {
  const { procedures } = await import('../support/procedures-data');
  return { requireStaffPageFor: procedures.requireStaffPageFor };
});
vi.mock('@/lib/server/data/procedures', async () => {
  const { procedures } = await import('../support/procedures-data');
  return { listProceduresFor: procedures.listProceduresFor };
});
vi.mock('@/lib/server/data/supplies', async () => {
  const { procedures } = await import('../support/procedures-data');
  return { listSuppliesFor: procedures.listSuppliesFor };
});
vi.mock('@/app/(staff)/procedimentos/procedure-actions', async () => {
  const { procedures } = await import('../support/procedures-data');
  return {
    createProcedure: procedures.createProcedure,
    updateProcedure: procedures.updateProcedure,
    setProcedureKit: procedures.setProcedureKit,
  };
});

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: async () => ({ success: ok, data, error: ok ? null : 'Erro' }),
});

/** O kit de um procedimento é lido sob demanda, ao abrir (GET /api/procedures/:id/kit). */
const mockKit = (
  respond: () => { ok: boolean; json: () => Promise<unknown> },
): ReturnType<typeof vi.fn> => {
  const fn = vi.fn(async () => respond());
  vi.stubGlobal('fetch', fn);
  return fn;
};

beforeEach(() => {
  data.reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const activeProcedure: ProcedureDto = {
  id: 'proc-1',
  name: 'Troca de bolsa de colostomia',
  priceCents: 12000,
  durationMinutes: 60,
  active: true,
  kitItemCount: 0,
};

const inactiveProcedure: ProcedureDto = {
  id: 'proc-2',
  name: 'Curativo simples',
  priceCents: 8000,
  durationMinutes: 30,
  active: false,
  kitItemCount: 0,
};

const supplyFixture: SupplyDto = {
  id: 'sup-1',
  name: 'Bolsa de colostomia',
  unit: 'un',
  minQty: 10,
  priceCents: 3000,
  stockQty: 20,
  isLowStock: false,
  isOutOfStock: false,
  active: true,
};

const secondSupplyFixture: SupplyDto = {
  id: 'sup-2',
  name: 'Gaze estéril',
  unit: 'un',
  minQty: 5,
  priceCents: 500,
  stockQty: 40,
  isLowStock: false,
  isOutOfStock: false,
  active: true,
};

const inactiveSupplyFixture: SupplyDto = {
  id: 'sup-3',
  name: 'Luva estéril (descontinuada)',
  unit: 'un',
  minQty: 5,
  priceCents: 500,
  stockQty: 0,
  isLowStock: false,
  isOutOfStock: true,
  active: false,
};

interface PageOptions {
  procedures?: ProcedureDto[];
  proceduresError?: boolean;
  supplies?: SupplyDto[];
  kitItems?: Array<{ supplyId: string; quantity: number }>;
}

/** Configura as leituras do servidor e o kit, e renderiza a página já resolvida. */
async function renderPage(options: PageOptions = {}) {
  data.listProceduresFor.mockImplementation(async () => {
    if (options.proceduresError) throw new ValidationError('Erro');
    return options.procedures ?? [];
  });
  data.listSuppliesFor.mockResolvedValue(options.supplies ?? []);
  mockKit(() => jsonResponse({ items: options.kitItems ?? [] }));
  return renderServerPage(ProceduresPage);
}

describe('Feature: Catálogo de procedimentos', () => {
  describe('Cenário: carregamento e listagem', () => {
    it('Dado nenhum procedimento, Quando a página carrega, Então exibe mensagem de vazio', async () => {
      await renderPage();

      expect(
        await screen.findByText(
          'Nenhum procedimento cadastrado — o agendamento continua com texto livre até o catálogo existir.',
        ),
      ).toBeInTheDocument();
    });

    it('Dado erro ao carregar procedimentos, Quando a página carrega, Então exibe alerta de erro', async () => {
      await renderPage({ proceduresError: true });

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('Dado procedimentos ativos e inativos, Quando a página carrega, Então lista com preço, duração e situação', async () => {
      await renderPage({ procedures: [activeProcedure, inactiveProcedure] });

      expect(
        await screen.findByText('Troca de bolsa de colostomia'),
      ).toBeInTheDocument();
      expect(screen.getByText('Curativo simples')).toBeInTheDocument();
      expect(screen.getByText('R$ 120,00')).toBeInTheDocument();
      expect(screen.getByText('60 min')).toBeInTheDocument();
      expect(screen.getByText('Ativo')).toBeInTheDocument();
      expect(screen.getByText('Inativo')).toBeInTheDocument();
    });
  });

  describe('Cenário: ativar e desativar procedimento', () => {
    it('Dado clique em Desativar, Quando acionado, Então grava a desativação (active false)', async () => {
      await renderPage({ procedures: [activeProcedure] });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() =>
        expect(data.updateProcedure).toHaveBeenCalledWith({
          id: 'proc-1',
          active: false,
        }),
      );
      expect(
        await screen.findByText('Procedimento desativado'),
      ).toBeInTheDocument();
    });

    it('Dado clique em Desativar seguido de cancelamento no dialog, Quando acionado, Então não grava', async () => {
      await renderPage({ procedures: [activeProcedure] });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Desativar'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(data.updateProcedure).not.toHaveBeenCalled();
    });

    it('Dado clique em Reativar em um procedimento inativo, Quando acionado, Então grava a reativação (active true)', async () => {
      await renderPage({ procedures: [inactiveProcedure] });
      await screen.findByText('Curativo simples');

      fireEvent.click(screen.getByText('Reativar'));

      await waitFor(() =>
        expect(data.updateProcedure).toHaveBeenCalledWith({
          id: 'proc-2',
          active: true,
        }),
      );
      expect(
        await screen.findByText('Procedimento ativado'),
      ).toBeInTheDocument();
    });

    it('Dado falha ao alternar situação, Quando acionado, Então exibe alerta de erro', async () => {
      data.updateProcedure.mockResolvedValue(
        actionError('Erro ao atualizar procedimento'),
      );
      await renderPage({ procedures: [activeProcedure] });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Erro ao atualizar procedimento'),
      ).toBeInTheDocument();
    });

    it('Dado falha ao alternar situação com um erro que não é instância de Error, Quando acionado, Então exibe a mensagem de erro padrão', async () => {
      data.updateProcedure.mockRejectedValue('falha de rede');
      await renderPage({ procedures: [activeProcedure] });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Erro ao atualizar procedimento'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: criar e editar procedimento', () => {
    it('Dado preenchimento do novo procedimento, Quando submetido, Então cria o procedimento e fecha o modal', async () => {
      await renderPage();
      await screen.findByText(
        'Nenhum procedimento cadastrado — o agendamento continua com texto livre até o catálogo existir.',
      );

      fireEvent.click(screen.getByText('+ Novo procedimento'));
      fireEvent.change(screen.getByLabelText(/Nome/), {
        target: { value: 'Consulta avulsa' },
      });
      fireEvent.change(screen.getByLabelText(/Preço/), {
        target: { value: '100' },
      });
      fireEvent.change(screen.getByLabelText(/Duração/), {
        target: { value: '45' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(data.createProcedure).toHaveBeenCalledWith({
          name: 'Consulta avulsa',
          priceCents: 10000,
          durationMinutes: 45,
        }),
      );
      expect(await screen.findByText('Procedimento salvo')).toBeInTheDocument();
    });

    it('Dado edição de procedimento existente, Quando o modal abre, Então preenche os campos atuais', async () => {
      await renderPage({ procedures: [activeProcedure] });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Editar'));

      expect(
        screen.getByDisplayValue('Troca de bolsa de colostomia'),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue('120')).toBeInTheDocument();
      expect(screen.getByDisplayValue('60')).toBeInTheDocument();
      expect(screen.getByText('Editar procedimento')).toBeInTheDocument();
    });

    it('Dado edição de procedimento existente, Quando submetido, Então grava a edição com os dados atualizados e fecha o modal', async () => {
      await renderPage({ procedures: [activeProcedure] });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Editar'));
      fireEvent.change(screen.getByLabelText(/Nome/), {
        target: { value: 'Troca de bolsa (atualizado)' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(data.updateProcedure).toHaveBeenCalledWith({
          id: 'proc-1',
          name: 'Troca de bolsa (atualizado)',
          priceCents: 12000,
          durationMinutes: 60,
        }),
      );
      expect(screen.queryByText('Editar procedimento')).not.toBeInTheDocument();
    });

    it('Dado clique em Editar, Quando a ficha abre ao lado da lista, Então a linha fica selecionada e a lista continua visível', async () => {
      await renderPage({ procedures: [activeProcedure] });
      await screen.findByText('Troca de bolsa de colostomia');
      fireEvent.click(screen.getByText('Editar'));

      expect(screen.getByRole('row', { selected: true })).toHaveTextContent(
        'Troca de bolsa de colostomia',
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('Dado a ficha aberta, Quando clicar em Fechar ficha, Então a ficha some e a seleção é limpa', async () => {
      await renderPage({ procedures: [activeProcedure] });
      await screen.findByText('Troca de bolsa de colostomia');
      fireEvent.click(screen.getByText('Editar'));
      fireEvent.click(screen.getByRole('button', { name: 'Fechar ficha' }));

      expect(screen.queryByText('Editar procedimento')).not.toBeInTheDocument();
      expect(screen.queryByRole('row', { selected: true })).toBeNull();
    });

    it('Dado clique no botão Fechar do modal de novo procedimento, Quando acionado, Então fecha o modal sem salvar', async () => {
      await renderPage();
      await screen.findByText(
        'Nenhum procedimento cadastrado — o agendamento continua com texto livre até o catálogo existir.',
      );

      fireEvent.click(screen.getByText('+ Novo procedimento'));
      expect(screen.getByText('Novo procedimento')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByText('Novo procedimento')).not.toBeInTheDocument();
      expect(data.createProcedure).not.toHaveBeenCalled();
    });

    it('Dado falha ao salvar procedimento com um erro que não é instância de Error, Quando submetido, Então exibe a mensagem de erro padrão no formulário', async () => {
      data.createProcedure.mockRejectedValue('falha de rede');
      await renderPage();
      await screen.findByText(
        'Nenhum procedimento cadastrado — o agendamento continua com texto livre até o catálogo existir.',
      );

      fireEvent.click(screen.getByText('+ Novo procedimento'));
      fireEvent.change(screen.getByLabelText(/Nome/), {
        target: { value: 'Consulta avulsa' },
      });
      fireEvent.change(screen.getByLabelText(/Preço/), {
        target: { value: '100' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      expect(
        await screen.findByText('Erro ao salvar procedimento'),
      ).toBeInTheDocument();
    });

    it('Dado falha ao salvar procedimento, Quando submetido, Então exibe alerta de erro no formulário', async () => {
      data.createProcedure.mockResolvedValue(
        actionError('Erro ao salvar procedimento'),
      );
      await renderPage();
      await screen.findByText(
        'Nenhum procedimento cadastrado — o agendamento continua com texto livre até o catálogo existir.',
      );

      fireEvent.click(screen.getByText('+ Novo procedimento'));
      fireEvent.change(screen.getByLabelText(/Nome/), {
        target: { value: 'Consulta avulsa' },
      });
      fireEvent.change(screen.getByLabelText(/Preço/), {
        target: { value: '100' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      expect(
        await screen.findByText('Erro ao salvar procedimento'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: kit de materiais do procedimento', () => {
    it('Dado kit vazio, Quando abrir o modal, Então exibe mensagem de nenhum item', async () => {
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture],
        kitItems: [],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));

      expect(
        await screen.findByText('Nenhum item — a conclusão não baixa estoque.'),
      ).toBeInTheDocument();
    });

    it('Dado kit com itens, Quando abrir o modal, Então exibe os insumos e quantidades atuais', async () => {
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture],
        kitItems: [{ supplyId: 'sup-1', quantity: 2 }],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));

      expect(
        await screen.findByText(
          'Kit de insumos — Troca de bolsa de colostomia',
        ),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue('2')).toBeInTheDocument();
    });

    it('Dado adição de item e salvamento, Quando confirmado, Então grava o kit com a lista de itens', async () => {
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture],
        kitItems: [],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));
      await screen.findByText('Nenhum item — a conclusão não baixa estoque.');

      fireEvent.click(screen.getByText('+ Adicionar insumo'));
      const select = screen.getByDisplayValue('Selecione o insumo…');
      fireEvent.change(select, { target: { value: 'sup-1' } });
      const quantityInput = screen.getByDisplayValue('1');
      fireEvent.change(quantityInput, { target: { value: '3' } });
      fireEvent.click(screen.getByText('Salvar kit'));

      await waitFor(() =>
        expect(data.setProcedureKit).toHaveBeenCalledWith({
          procedureId: 'proc-1',
          items: [{ supplyId: 'sup-1', quantity: 3 }],
        }),
      );
      expect(await screen.findByText('Kit atualizado')).toBeInTheDocument();
    });

    it('Dado remoção de um item do kit, Quando acionado, Então o item some da lista', async () => {
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture],
        kitItems: [{ supplyId: 'sup-1', quantity: 2 }],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));
      await screen.findByText('Kit de insumos — Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('remover'));

      expect(
        await screen.findByText('Nenhum item — a conclusão não baixa estoque.'),
      ).toBeInTheDocument();
    });

    it('Dado falha ao salvar o kit, Quando confirmado, Então exibe alerta de erro', async () => {
      data.setProcedureKit.mockResolvedValue(actionError('Erro ao salvar kit'));
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture],
        kitItems: [{ supplyId: 'sup-1', quantity: 2 }],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));
      await screen.findByText('Kit de insumos — Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Salvar kit'));

      expect(await screen.findByText('Erro ao salvar kit')).toBeInTheDocument();
    });

    it('Dado falha ao salvar o kit com um erro que não é instância de Error, Quando confirmado, Então exibe a mensagem de erro padrão', async () => {
      data.setProcedureKit.mockRejectedValue('falha de rede');
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture],
        kitItems: [{ supplyId: 'sup-1', quantity: 2 }],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));
      await screen.findByText('Kit de insumos — Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Salvar kit'));

      expect(await screen.findByText('Erro ao salvar kit')).toBeInTheDocument();
    });

    it('Dado item do kit referenciando um insumo inativo, Quando o modal abre, Então exibe o insumo inativo como opção extra com o nome cadastrado', async () => {
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture, inactiveSupplyFixture],
        kitItems: [{ supplyId: inactiveSupplyFixture.id, quantity: 1 }],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));
      await screen.findByText('Kit de insumos — Troca de bolsa de colostomia');

      expect(
        await screen.findByText('Luva estéril (descontinuada)'),
      ).toBeInTheDocument();
    });

    it('Dado item do kit referenciando um insumo inexistente, Quando o modal abre, Então exibe o identificador do insumo como rótulo da opção extra', async () => {
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture],
        kitItems: [{ supplyId: 'sup-removido', quantity: 1 }],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));
      await screen.findByText('Kit de insumos — Troca de bolsa de colostomia');

      expect(await screen.findByText('sup-removido')).toBeInTheDocument();
    });

    it('Dado múltiplos itens no kit, Quando altero o insumo de um dos itens, Então o outro item permanece inalterado', async () => {
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture, secondSupplyFixture],
        kitItems: [
          { supplyId: supplyFixture.id, quantity: 2 },
          { supplyId: secondSupplyFixture.id, quantity: 3 },
        ],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));
      await screen.findByText('Kit de insumos — Troca de bolsa de colostomia');

      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      expect(selects).toHaveLength(2);
      fireEvent.change(selects[0], { target: { value: '' } });

      expect(selects[0].value).toBe('');
      expect(selects[1].value).toBe(secondSupplyFixture.id);
    });

    it('Dado múltiplos itens no kit, Quando altero a quantidade de um dos itens, Então o outro item permanece inalterado', async () => {
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture, secondSupplyFixture],
        kitItems: [
          { supplyId: supplyFixture.id, quantity: 2 },
          { supplyId: secondSupplyFixture.id, quantity: 3 },
        ],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));
      await screen.findByText('Kit de insumos — Troca de bolsa de colostomia');

      const quantityInputs = screen.getAllByDisplayValue(
        /^[0-9]+$/,
      ) as HTMLInputElement[];
      expect(quantityInputs).toHaveLength(2);
      fireEvent.change(quantityInputs[0], { target: { value: '9' } });

      expect(quantityInputs[0].value).toBe('9');
      expect(quantityInputs[1].value).toBe('3');
    });

    it('Dado quantidade vazia ao salvar o kit, Quando confirmado, Então bloqueia o envio com erro inline (PROC-04)', async () => {
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture],
        kitItems: [{ supplyId: supplyFixture.id, quantity: 2 }],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));
      await screen.findByText('Kit de insumos — Troca de bolsa de colostomia');

      const quantityInput = screen.getByDisplayValue('2');
      fireEvent.change(quantityInput, { target: { value: '' } });
      fireEvent.click(screen.getByText('Salvar kit'));

      expect(
        await screen.findByText(
          'Quantidade deve ser um número inteiro maior que zero em todos os itens',
        ),
      ).toBeInTheDocument();
      expect(data.setProcedureKit).not.toHaveBeenCalled();
    });

    it('Dado insumo já escolhido em outra linha do kit, Quando abrir o seletor da 2ª linha, Então a opção não aparece (PROC-04)', async () => {
      await renderPage({
        procedures: [activeProcedure],
        supplies: [supplyFixture, secondSupplyFixture],
        kitItems: [{ supplyId: supplyFixture.id, quantity: 2 }],
      });
      await screen.findByText('Troca de bolsa de colostomia');

      fireEvent.click(screen.getByText('Sem kit'));
      await screen.findByText('Kit de insumos — Troca de bolsa de colostomia');
      fireEvent.click(screen.getByText('+ Adicionar insumo'));

      const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
      const secondRowOptions = Array.from(selects[1].options).map(
        (o) => o.value,
      );
      expect(secondRowOptions).not.toContain(supplyFixture.id);
      expect(secondRowOptions).toContain(secondSupplyFixture.id);
    });
  });

  describe('Cenário: busca e contagem', () => {
    it('Dado 2 procedimentos, Quando digitar parte de um nome, Então filtra a lista e atualiza a contagem (PROC-05)', async () => {
      await renderPage({ procedures: [activeProcedure, inactiveProcedure] });
      await screen.findByText('Troca de bolsa de colostomia');
      expect(screen.getByText('2 procedimentos')).toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText('Buscar por nome…'), {
        target: { value: 'Curativo' },
      });

      expect(
        screen.queryByText('Troca de bolsa de colostomia'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Curativo simples')).toBeInTheDocument();
      expect(screen.getByText('1 procedimento')).toBeInTheDocument();
    });
  });

  describe('Cenário: kit deixa de ser opaco', () => {
    it('Dado procedimento com kitItemCount > 0, Quando renderizar, Então o botão mostra a contagem (PROC-03)', async () => {
      await renderPage({
        procedures: [{ ...activeProcedure, kitItemCount: 3 }],
      });

      expect(await screen.findByText('Kit (3)')).toBeInTheDocument();
    });
  });

  describe('Cenário: alvo de toque e hierarquia', () => {
    it('Dado a linha do procedimento, Quando renderizar as ações, Então usam Button ghost/sm (PROC-02)', async () => {
      await renderPage({ procedures: [activeProcedure] });
      await screen.findByText('Troca de bolsa de colostomia');

      expect(screen.getByText('Editar')).toHaveClass(
        'sv-btn--ghost',
        'sv-btn--sm',
      );
    });
  });
});
