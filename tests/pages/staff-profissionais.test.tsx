// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfessionalsPage from '@/app/(staff)/profissionais/page';
import { ValidationError } from '@/domain/shared/errors';
import type { ProfessionalDto } from '@/lib/dto';
import { actionError, equipe } from '../support/equipe-data';
import { renderServerPage } from '../support/server-page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/profissionais',
}));
vi.mock('@/lib/server/session', async () => {
  const { equipe } = await import('../support/equipe-data');
  return { requireStaffPageFor: equipe.requireStaffPageFor };
});
vi.mock('@/lib/server/data/professionals', async () => {
  const { equipe } = await import('../support/equipe-data');
  return { listProfessionalsFor: equipe.listProfessionalsFor };
});
vi.mock('@/app/(staff)/profissionais/professional-actions', async () => {
  const { equipe } = await import('../support/equipe-data');
  return {
    createProfessional: equipe.createProfessional,
    updateProfessional: equipe.updateProfessional,
    saveAvailability: equipe.saveAvailability,
  };
});

beforeEach(() => {
  equipe.reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const professional = (
  overrides: Partial<ProfessionalDto> = {},
): ProfessionalDto => ({
  id: 'prof-1',
  fullName: 'Dra. Ana',
  registry: 'COREN-SP 123',
  commissionType: 'percentage',
  commissionPct: null,
  commissionFixedCents: null,
  active: true,
  ...overrides,
});

async function renderPage(
  options: { professionals?: ProfessionalDto[]; failure?: boolean } = {},
) {
  equipe.listProfessionalsFor.mockImplementation(async () => {
    if (options.failure) throw new ValidationError('Erro');
    return options.professionals ?? [];
  });
  return renderServerPage(ProfessionalsPage);
}

const newProfessional = () => {
  fireEvent.click(screen.getByText('+ Novo profissional'));
  fireEvent.change(screen.getByLabelText(/Nome \*/), {
    target: { value: 'Dr. Pedro' },
  });
};

describe('Feature: Profissionais no servidor (#550)', () => {
  describe('Cenário: listagem', () => {
    it('Dado nenhum profissional, Quando a página carrega, Então exibe mensagem de vazio', async () => {
      await renderPage();

      expect(
        screen.getByText(
          'Nenhum profissional cadastrado. Consultas e evoluções podem ser atribuídas após o cadastro.',
        ),
      ).toBeInTheDocument();
    });

    it('Dado profissionais cadastrados, Quando a página carrega, Então lista dados sem chamar a API', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      await renderPage({ professionals: [professional()] });

      expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
      expect(screen.getByText('COREN-SP 123')).toBeInTheDocument();
      expect(screen.getByText('Ativo')).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('Dado repasses cadastrados, Quando a tabela renderiza, Então mostra a coluna Repasse (PROF-01)', async () => {
      await renderPage({
        professionals: [
          professional({ id: 'p1', fullName: 'Dra. Sofia', commissionPct: 20 }),
          professional({
            id: 'p2',
            fullName: 'Dr. Caio',
            commissionType: 'fixed',
            commissionFixedCents: 5000,
          }),
        ],
      });

      expect(screen.getByText('20% da sessão')).toBeInTheDocument();
      expect(screen.getByText('R$ 50,00 por sessão')).toBeInTheDocument();
    });

    it('Dado profissional listado, Quando clicar em Horários, Então abre o editor de horário dele', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            success: true,
            data: { windows: [] },
            error: null,
          }),
        })),
      );
      await renderPage({ professionals: [professional()] });

      fireEvent.click(screen.getByRole('button', { name: 'Horários' }));

      expect(
        await screen.findByRole('dialog', { name: 'Horários — Dra. Ana' }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: 'Salvar horários' }),
      ).toBeInTheDocument();
    });

    it('Dado erro ao carregar, Quando a página carrega, Então exibe alerta de erro', async () => {
      await renderPage({ failure: true });

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Cenário: alternar situação', () => {
    it('Dado clique em desativar e confirmação, Quando a ação é bem-sucedida, Então envia active=false e exibe o toast', async () => {
      await renderPage({ professionals: [professional()] });

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() =>
        expect(equipe.updateProfessional).toHaveBeenCalledWith({
          id: 'prof-1',
          active: false,
        }),
      );
      expect(
        await screen.findByText('Profissional desativado'),
      ).toBeInTheDocument();
    });

    it("Dado clique em reativar, Quando a ação é bem-sucedida, Então exibe toast 'Profissional ativado'", async () => {
      await renderPage({
        professionals: [professional({ fullName: 'Dr. Bruno', active: false })],
      });

      fireEvent.click(screen.getByText('Reativar'));

      await waitFor(() =>
        expect(equipe.updateProfessional).toHaveBeenCalledWith({
          id: 'prof-1',
          active: true,
        }),
      );
      expect(
        await screen.findByText('Profissional ativado'),
      ).toBeInTheDocument();
    });

    it('Dado erro ao alternar situação, Quando a ação falha, Então exibe a mensagem do servidor', async () => {
      equipe.updateProfessional.mockResolvedValue(
        actionError('Profissional não encontrado'),
      );
      await renderPage({ professionals: [professional()] });

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Profissional não encontrado'),
      ).toBeInTheDocument();
    });

    it('Dado ação que rejeita com valor que não é Error, Quando desativar, Então exibe mensagem padrão', async () => {
      equipe.updateProfessional.mockRejectedValue('falha');
      await renderPage({ professionals: [professional()] });

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Erro ao atualizar profissional'),
      ).toBeInTheDocument();
    });

    it('Dado clique em desativar seguido de cancelamento no dialog, Quando acionado, Então não chama a ação', async () => {
      await renderPage({ professionals: [professional()] });

      fireEvent.click(screen.getByText('Desativar'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(equipe.updateProfessional).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: profissional inativo e edição existente', () => {
    it('Dado profissional inativo sem registro, Quando a página carrega, Então exibe situação inativa e ação de reativar', async () => {
      await renderPage({
        professionals: [
          professional({
            fullName: 'Dr. Bruno',
            registry: null,
            active: false,
          }),
        ],
      });

      expect(screen.getByText('Inativo')).toBeInTheDocument();
      expect(screen.getByText('Reativar')).toBeInTheDocument();
      expect(screen.getAllByText('—').length).toBe(2);
    });

    it('Dado clique em editar, Quando a ficha abre, Então preenche os campos com os dados atuais', async () => {
      await renderPage({ professionals: [professional()] });

      fireEvent.click(screen.getByText('Editar'));

      expect(screen.getByText('Editar profissional')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Dra. Ana')).toBeInTheDocument();
      expect(screen.getByDisplayValue('COREN-SP 123')).toBeInTheDocument();
    });

    it('Dado ficha aberta, Quando fechada sem salvar, Então a ficha desaparece sem gravar', async () => {
      await renderPage({ professionals: [professional()] });

      fireEvent.click(screen.getByText('Editar'));
      fireEvent.click(screen.getByRole('button', { name: 'Fechar ficha' }));

      await waitFor(() =>
        expect(
          screen.queryByText('Editar profissional'),
        ).not.toBeInTheDocument(),
      );
      expect(equipe.updateProfessional).not.toHaveBeenCalled();
    });

    it('Dado alteração do registro, Quando salvo, Então envia o id e os dados atualizados', async () => {
      await renderPage({ professionals: [professional()] });

      fireEvent.click(screen.getByText('Editar'));
      fireEvent.change(screen.getByLabelText(/Registro profissional/), {
        target: { value: 'COREN-SP 456' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(equipe.updateProfessional).toHaveBeenCalledWith({
          id: 'prof-1',
          fullName: 'Dra. Ana',
          registry: 'COREN-SP 456',
          commissionType: 'percentage',
          commissionPct: null,
          commissionFixedCents: null,
        }),
      );
      expect(await screen.findByText('Profissional salvo')).toBeInTheDocument();
    });
  });

  describe('Cenário: criação via modal', () => {
    it('Dado novo profissional preenchido, Quando submetido, Então cria o profissional', async () => {
      await renderPage();

      newProfessional();
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(equipe.createProfessional).toHaveBeenCalledWith({
          fullName: 'Dr. Pedro',
          registry: null,
          commissionType: 'percentage',
          commissionPct: null,
          commissionFixedCents: null,
        }),
      );
      expect(await screen.findByText('Profissional salvo')).toBeInTheDocument();
    });

    it('Dado preenchimento com repasse, Quando submetido, Então envia commissionPct (PROF-01)', async () => {
      await renderPage();

      newProfessional();
      fireEvent.change(screen.getByLabelText(/Repasse/), {
        target: { value: '15' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(equipe.createProfessional).toHaveBeenCalledWith(
          expect.objectContaining({ commissionPct: 15 }),
        ),
      );
    });

    it('Dado tipo valor fixo, Quando submetido, Então envia commissionType fixed e o valor em centavos', async () => {
      await renderPage();

      newProfessional();
      fireEvent.change(screen.getByLabelText('Tipo de repasse'), {
        target: { value: 'fixed' },
      });
      fireEvent.change(screen.getByLabelText(/Valor por sessão/), {
        target: { value: '50.5' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(equipe.createProfessional).toHaveBeenCalledWith(
          expect.objectContaining({
            commissionType: 'fixed',
            commissionFixedCents: 5050,
          }),
        ),
      );
    });

    it('Dado o campo Registro, Quando renderizar, Então mostra hint persistente abaixo do input (PROF-02)', async () => {
      await renderPage();

      fireEvent.click(screen.getByText('+ Novo profissional'));
      fireEvent.change(screen.getByLabelText(/Registro profissional/), {
        target: { value: 'COREN-SP 999' },
      });

      expect(screen.getByText('Ex.: COREN-SP 123456')).toBeInTheDocument();
    });

    it('Dado erro do servidor ao salvar, Quando a ação falha, Então exibe o alerta no formulário', async () => {
      equipe.createProfessional.mockResolvedValue(
        actionError('Erro ao salvar profissional'),
      );
      await renderPage();

      newProfessional();
      fireEvent.click(screen.getByText('Salvar'));

      expect(
        await screen.findByText('Erro ao salvar profissional'),
      ).toBeInTheDocument();
    });

    it('Dado ação que rejeita com valor que não é Error, Quando salvar, Então exibe a mensagem padrão', async () => {
      equipe.createProfessional.mockRejectedValue('falha');
      await renderPage();

      newProfessional();
      fireEvent.click(screen.getByText('Salvar'));

      expect(
        await screen.findByText('Erro ao salvar profissional'),
      ).toBeInTheDocument();
    });
  });
});
