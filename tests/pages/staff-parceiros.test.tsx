// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PartnersPage from '@/app/(staff)/parceiros/page';
import { ValidationError } from '@/domain/shared/errors';
import type { PartnerDto } from '@/lib/dto';
import { actionError, equipe } from '../support/equipe-data';
import { renderServerPage } from '../support/server-page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/parceiros',
}));
vi.mock('@/lib/server/session', async () => {
  const { equipe } = await import('../support/equipe-data');
  return { requireStaffPageFor: equipe.requireStaffPageFor };
});
vi.mock('@/lib/server/data/partners', async () => {
  const { equipe } = await import('../support/equipe-data');
  return { listPartnersFor: equipe.listPartnersFor };
});
vi.mock('@/app/(staff)/parceiros/partner-actions', async () => {
  const { equipe } = await import('../support/equipe-data');
  return {
    createPartner: equipe.createPartner,
    updatePartner: equipe.updatePartner,
  };
});

beforeEach(() => {
  equipe.reset();
});

afterEach(() => {
  cleanup();
});

const partner = (overrides: Partial<PartnerDto> = {}): PartnerDto => ({
  id: 'pt1',
  fullName: 'Dr. João',
  email: 'joao@parceiro.com',
  phone: '11999999999',
  crm: 'CRM-SP 123',
  specialty: 'Vascular',
  active: true,
  ...overrides,
});

async function renderPage(
  options: { partners?: PartnerDto[]; failure?: boolean } = {},
) {
  equipe.listPartnersFor.mockImplementation(async () => {
    if (options.failure) throw new ValidationError('Erro');
    return options.partners ?? [];
  });
  return renderServerPage(PartnersPage);
}

const fillNewPartner = () => {
  fireEvent.click(screen.getByText('+ Novo parceiro'));
  fireEvent.change(screen.getByLabelText(/Nome completo/), {
    target: { value: 'Dr. Novo' },
  });
  fireEvent.change(screen.getByLabelText(/Email \*/), {
    target: { value: 'novo@parceiro.com' },
  });
  fireEvent.change(screen.getByLabelText(/Telefone/), {
    target: { value: '11988887777' },
  });
};

describe('Feature: Parceiros no servidor (#550)', () => {
  describe('Cenário: listagem', () => {
    it('Dado nenhum parceiro, Quando a página carrega, Então exibe mensagem de vazio', async () => {
      await renderPage();

      expect(
        screen.getByText('Nenhum parceiro cadastrado.'),
      ).toBeInTheDocument();
    });

    it('Dado parceiros cadastrados, Quando a página carrega, Então lista dados sem chamar a API', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      await renderPage({ partners: [partner()] });

      expect(screen.getByText('Dr. João')).toBeInTheDocument();
      expect(screen.getByText('CRM-SP 123')).toBeInTheDocument();
      expect(screen.getByText('Vascular')).toBeInTheDocument();
      expect(screen.getByText('Ativo')).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('Dado erro ao carregar, Quando a página carrega, Então exibe alerta de erro', async () => {
      await renderPage({ failure: true });

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('Dado a página de parceiros, Quando renderizar, Então o título é Parceiros', async () => {
      await renderPage();

      expect(
        screen.getByRole('heading', { name: 'Parceiros', level: 1 }),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: alternar situação', () => {
    it('Dado clique em desativar e confirmação, Quando a ação é bem-sucedida, Então envia active=false e exibe o toast', async () => {
      await renderPage({ partners: [partner()] });

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() =>
        expect(equipe.updatePartner).toHaveBeenCalledWith({
          id: 'pt1',
          active: false,
        }),
      );
      expect(
        await screen.findByText('Parceiro desativado'),
      ).toBeInTheDocument();
    });

    it('Dado erro ao alternar situação, Quando a ação falha, Então exibe a mensagem do servidor', async () => {
      equipe.updatePartner.mockResolvedValue(
        actionError('Parceiro não achado'),
      );
      await renderPage({ partners: [partner()] });

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Parceiro não achado'),
      ).toBeInTheDocument();
    });

    it('Dado clique em desativar seguido de cancelamento no dialog, Quando acionado, Então não chama a ação', async () => {
      await renderPage({ partners: [partner()] });

      fireEvent.click(screen.getByText('Desativar'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(equipe.updatePartner).not.toHaveBeenCalled();
    });

    it('Dado clique em Desativar parceiro, Quando o diálogo abre, Então explica o impacto em pacientes indicados (PART-03)', async () => {
      await renderPage({ partners: [partner()] });

      fireEvent.click(screen.getByText('Desativar'));

      expect(
        await screen.findByText(/podem perder a referência na próxima edição/),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: parceiro inativo na listagem', () => {
    const inactive = partner({
      id: 'pt2',
      fullName: 'Dr. Carlos',
      active: false,
    });

    it('Dado parceiro inativo, Quando a página carrega, Então exibe situação inativa e ação de reativar', async () => {
      await renderPage({ partners: [inactive] });

      expect(screen.getByText('Inativo')).toBeInTheDocument();
      expect(screen.getByText('Reativar')).toBeInTheDocument();
    });

    it("Dado clique em reativar, Quando a ação é bem-sucedida, Então envia active=true e exibe toast 'Parceiro ativado'", async () => {
      await renderPage({ partners: [inactive] });

      fireEvent.click(screen.getByText('Reativar'));

      await waitFor(() =>
        expect(equipe.updatePartner).toHaveBeenCalledWith({
          id: 'pt2',
          active: true,
        }),
      );
      expect(await screen.findByText('Parceiro ativado')).toBeInTheDocument();
    });

    it('Dado parceiro inativo, Quando renderizar a linha, Então usa bg-surface-2/60 em vez de opacity-50 (DIR-01)', async () => {
      await renderPage({ partners: [inactive] });

      const row = screen.getByText('Dr. Carlos').closest('tr');
      expect(row).toHaveClass('bg-surface-2/60');
      expect(row).not.toHaveClass('opacity-50');
    });
  });

  describe('Cenário: contato acionável e ações (PART-04/05, DIR-02)', () => {
    it('Dado um parceiro, Quando renderizar Contato, Então email e telefone são links mailto/tel', async () => {
      await renderPage({
        partners: [
          partner({ email: 'igor@parceiro.com', phone: '11955554444' }),
        ],
      });

      expect(
        screen.getByRole('link', { name: 'igor@parceiro.com' }),
      ).toHaveAttribute('href', 'mailto:igor@parceiro.com');
      expect(
        screen.getByRole('link', { name: '(11) 95555-4444' }),
      ).toHaveAttribute('href', 'tel:11955554444');
    });

    it('Dado um parceiro ativo, Quando renderizar as ações, Então usam Button ghost/sm', async () => {
      await renderPage({ partners: [partner()] });

      expect(screen.getByText('Editar')).toHaveClass(
        'sv-btn--ghost',
        'sv-btn--sm',
      );
    });
  });

  describe('Cenário: criação via modal', () => {
    it('Dado novo parceiro preenchido, Quando submetido, Então cria o parceiro e fecha o modal', async () => {
      await renderPage();

      fillNewPartner();
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(equipe.createPartner).toHaveBeenCalledWith({
          fullName: 'Dr. Novo',
          email: 'novo@parceiro.com',
          phone: '11988887777',
          crm: null,
          specialty: null,
        }),
      );
      expect(await screen.findByText('Parceiro salvo')).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByText('Novo parceiro')).not.toBeInTheDocument(),
      );
    });

    it('Dado o modal de novo parceiro, Quando renderizar, Então o grid de Telefone/CRM é responsivo (PART-02)', async () => {
      await renderPage();

      fireEvent.click(screen.getByText('+ Novo parceiro'));

      const grid = screen.getByLabelText(/Telefone/).closest('div.grid');
      expect(grid).toHaveClass('grid-cols-1', 'sm:grid-cols-2');
    });

    it('Dado email já usado, Quando o servidor rejeita, Então exibe o erro no formulário e mantém o modal (PART-01)', async () => {
      equipe.createPartner.mockResolvedValue(
        actionError('Já existe parceiro com este e-mail'),
      );
      await renderPage();

      fillNewPartner();
      fireEvent.click(screen.getByText('Salvar'));

      expect(
        await screen.findByText('Já existe parceiro com este e-mail'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Nome completo/)).toHaveValue('Dr. Novo');
    });
  });

  describe('Cenário: edição na ficha', () => {
    it('Dado clique em editar, Quando a ficha abre, Então preenche os campos com os dados atuais', async () => {
      await renderPage({ partners: [partner()] });

      fireEvent.click(screen.getByText('Editar'));

      expect(screen.getByText('Editar parceiro')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Dr. João')).toBeInTheDocument();
      expect(screen.getByDisplayValue('joao@parceiro.com')).toBeInTheDocument();
    });

    it('Dado parceiro sem CRM ou especialidade, Quando a ficha abre, Então os campos ficam vazios', async () => {
      await renderPage({
        partners: [partner({ crm: null, specialty: null })],
      });

      fireEvent.click(screen.getByText('Editar'));

      expect(screen.getByPlaceholderText('Ex.: CRM-SP 123456')).toHaveValue('');
      expect(screen.getByPlaceholderText('Ex.: Cirurgia vascular')).toHaveValue(
        '',
      );
    });

    it('Dado ficha aberta, Quando fechada sem salvar, Então a ficha desaparece', async () => {
      await renderPage({ partners: [partner()] });

      fireEvent.click(screen.getByText('Editar'));
      fireEvent.click(screen.getByRole('button', { name: 'Fechar ficha' }));

      await waitFor(() =>
        expect(screen.queryByText('Editar parceiro')).not.toBeInTheDocument(),
      );
    });

    it('Dado alteração de CRM e especialidade, Quando salvo, Então envia o id e os dados atualizados', async () => {
      await renderPage({ partners: [partner()] });

      fireEvent.click(screen.getByText('Editar'));
      fireEvent.change(screen.getByPlaceholderText('Ex.: CRM-SP 123456'), {
        target: { value: 'CRM-RJ 999' },
      });
      fireEvent.change(screen.getByPlaceholderText('Ex.: Cirurgia vascular'), {
        target: { value: 'Dermatologia' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() =>
        expect(equipe.updatePartner).toHaveBeenCalledWith({
          id: 'pt1',
          fullName: 'Dr. João',
          email: 'joao@parceiro.com',
          phone: '11999999999',
          crm: 'CRM-RJ 999',
          specialty: 'Dermatologia',
        }),
      );
      expect(await screen.findByText('Parceiro salvo')).toBeInTheDocument();
    });

    it('Dado erro ao salvar a edição, Quando a ação falha, Então exibe o alerta no formulário', async () => {
      equipe.updatePartner.mockResolvedValue(
        actionError('Erro ao salvar parceiro'),
      );
      await renderPage({ partners: [partner()] });

      fireEvent.click(screen.getByText('Editar'));
      fireEvent.click(screen.getByText('Salvar'));

      expect(
        await screen.findByText('Erro ao salvar parceiro'),
      ).toBeInTheDocument();
    });

    it('Dado ação que rejeita com valor que não é Error, Quando salvar, Então exibe a mensagem padrão', async () => {
      equipe.createPartner.mockRejectedValue('falha');
      await renderPage();

      fillNewPartner();
      fireEvent.click(screen.getByText('Salvar'));

      expect(
        await screen.findByText('Erro ao salvar parceiro'),
      ).toBeInTheDocument();
    });

    it('Dado ação que rejeita com valor que não é Error, Quando desativar, Então exibe a mensagem padrão', async () => {
      equipe.updatePartner.mockRejectedValue('falha');
      await renderPage({ partners: [partner()] });

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Erro ao atualizar parceiro'),
      ).toBeInTheDocument();
    });
  });
});
