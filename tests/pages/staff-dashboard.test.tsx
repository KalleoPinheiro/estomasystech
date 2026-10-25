// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(staff)/page';
import type { AppointmentDto, FollowUpDto, SupplyDto } from '@/lib/dto';
import { formatDate } from '@/lib/format';
import { hoje, mockHojeData, resetHojeData } from '../support/hoje-data';
import { renderServerPage, suspenseFallbacks } from '../support/server-page';

vi.mock('next/navigation', async () => {
  const { hoje } = await import('../support/hoje-data');
  return {
    useRouter: () => ({ refresh: hoje.refresh, push: vi.fn() }),
    usePathname: () => '/',
  };
});
vi.mock('@/lib/server/session', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { requireStaffPage: hoje.requireStaffPage };
});
vi.mock('@/lib/server/data/appointments', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listAppointmentsFor: hoje.listAppointmentsFor };
});
vi.mock('@/lib/server/data/month-summary', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { buildMonthSummary: hoje.buildMonthSummary };
});
vi.mock('@/lib/server/data/follow-ups', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listFollowUpsFor: hoje.listFollowUpsFor };
});
vi.mock('@/lib/server/data/reminders', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { whatsappSentToday: hoje.whatsappSentToday };
});
vi.mock('@/lib/server/data/supplies', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listSuppliesFor: hoje.listSuppliesFor };
});
vi.mock('@/lib/server/data/triage', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { buildLinkedTriageQueue: hoje.buildLinkedTriageQueue };
});
vi.mock('@/lib/server/data/majority', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listMajorityReviewsFor: hoje.listMajorityReviewsFor };
});
vi.mock('@/app/(staff)/hoje-actions', async () => {
  const { hoje } = await import('../support/hoje-data');
  return {
    resolveFollowUp: hoje.resolveFollowUp,
    decideTriage: hoje.decideTriage,
    keepMajorityGuardian: hoje.keepMajorityGuardian,
  };
});

interface TriagePhotoFixture {
  id: string;
  conditionTitle: string;
  patientId: string | null;
  patientName: string;
  patientNote: string | null;
  createdAt: string;
  waitingHours: number;
  latestScore: { kind: 'push' | 'det'; value: number } | null;
}

const appointmentFixture: AppointmentDto = {
  id: 'appt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: '2026-07-19T12:00:00.000Z',
  endsAt: '2026-07-19T13:00:00.000Z',
  procedure: 'Troca de bolsa',
  priceCents: 12000,
  notes: null,
  status: 'scheduled',
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
};

const followUpFixture: FollowUpDto = {
  id: 'fu-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  appointmentId: null,
  dueDate: '2026-07-20T00:00:00.000Z',
  reason: 'Retorno: avaliação de ferida',
  status: 'pending',
  isOverdue: true,
};

const supplyFixture: SupplyDto = {
  id: 'sup-1',
  name: 'Bolsa de colostomia',
  unit: 'un',
  minQty: 10,
  priceCents: 3000,
  stockQty: 2,
  isLowStock: true,
  isOutOfStock: false,
  active: true,
};

const triageFixture: TriagePhotoFixture = {
  id: 'photo-1',
  conditionTitle: 'Ferida perna E',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  patientNote: 'Está coçando',
  createdAt: '2026-07-18T10:00:00.000Z',
  waitingHours: 2,
  latestScore: null,
};

const renderPage = () => renderServerPage(DashboardPage);

beforeEach(() => {
  resetHojeData();
  mockHojeData();
});

afterEach(() => {
  cleanup();
});

describe('Feature: Dashboard do painel interno', () => {
  describe('Cenário: carregando', () => {
    it('Dado que o resumo ainda não chegou, Quando renderizar, Então cada bloco tem o próprio indicador de carregamento', async () => {
      mockHojeData();

      // Server Components: cada bloco espera o próprio dado dentro de um
      // <Suspense> com esqueleto, então KPIs e "Consultas de hoje" carregam
      // sem segurar a tela inteira.
      const fallbacks = suspenseFallbacks(await DashboardPage());

      expect(fallbacks.filter(Boolean).length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Cenário: erro ao carregar resumo', () => {
    it('Dado falha na API de resumo, Quando renderizar, Então exibe alerta de erro', async () => {
      mockHojeData({ summaryError: 'Erro ao buscar resumo' });
      await renderPage();

      await waitFor(() => {
        // O erro fica no bloco que depende do resumo — a página continua.
        expect(
          screen.getAllByText('Erro ao buscar resumo').length,
        ).toBeGreaterThan(0);
        expect(screen.getByText('Retornos pendentes')).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: resumo carregado com dados', () => {
    it('Dado resumo, consultas do dia, retornos e estoque, Quando renderizar, Então exibe os cartões e listas', async () => {
      mockHojeData({
        today: [appointmentFixture],
        followUps: [followUpFixture],
        supplies: [supplyFixture],
      });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('R$ 1.500,00')).toBeInTheDocument();
      });
      expect(screen.getByText('R$ 500,00')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();

      expect(screen.getAllByText('Maria Souza').length).toBeGreaterThan(0);
      expect(screen.getByText('Troca de bolsa')).toBeInTheDocument();

      expect(screen.getByText(/Atrasado/)).toBeInTheDocument();
      expect(screen.getByText('Bolsa de colostomia')).toBeInTheDocument();
      expect(screen.getByText('2/10 un')).toBeInTheDocument();
    });

    it('Dado status de consulta sem rótulo mapeado, Quando renderizar, Então usa o status bruto como rótulo', async () => {
      mockHojeData({
        today: [{ ...appointmentFixture, status: 'rescheduled' }],
      });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('rescheduled')).toBeInTheDocument();
      });
    });

    it('Dado retorno não atrasado, Quando renderizar, Então não exibe o marcador de atraso', async () => {
      mockHojeData({
        followUps: [{ ...followUpFixture, isOverdue: false }],
      });
      await renderPage();

      await waitFor(() => {
        expect(
          screen.getByText(formatDate(followUpFixture.dueDate)),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/Atrasado/)).not.toBeInTheDocument();
    });
  });

  describe('Cenário: listas vazias', () => {
    it('Dado nenhuma consulta hoje, nenhum retorno e nenhum insumo baixo, Quando renderizar, Então exibe mensagens de estado vazio', async () => {
      mockHojeData();
      await renderPage();

      await waitFor(() => {
        expect(
          screen.getByText('Nenhuma consulta agendada para hoje.'),
        ).toBeInTheDocument();
      });
      expect(screen.getByText('Nenhum retorno pendente.')).toBeInTheDocument();
      expect(
        screen.getByText('Nenhum insumo abaixo do mínimo.'),
      ).toBeInTheDocument();
    });

    it('Dado insumos existentes mas nenhum abaixo do mínimo, Quando renderizar, Então filtra a lista de estoque baixo', async () => {
      mockHojeData({ supplies: [{ ...supplyFixture, isLowStock: false }] });
      await renderPage();

      await waitFor(() => {
        expect(
          screen.getByText('Nenhum insumo abaixo do mínimo.'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Cenário: ações de retorno pendente', () => {
    it('Dado clique em Concluir, Quando acionado, Então chama a ação de concluir e atualiza a lista', async () => {
      mockHojeData({ followUps: [followUpFixture] });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Concluir')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Concluir'));

      await waitFor(() => {
        expect(hoje.resolveFollowUp).toHaveBeenCalledWith({
          id: 'fu-1',
          status: 'done',
        });
      });
    });

    it('Dado clique em Cancelar, Quando acionado, Então chama a ação com status cancelled', async () => {
      mockHojeData({ followUps: [followUpFixture] });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Cancelar')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(await screen.findByText('Cancelar retorno'));

      await waitFor(() => {
        expect(hoje.resolveFollowUp).toHaveBeenCalledWith({
          id: 'fu-1',
          status: 'cancelled',
        });
      });
    });

    it('Dado clique em Cancelar seguido de cancelamento no dialog, Quando acionado, Então não chama a ação', async () => {
      mockHojeData({ followUps: [followUpFixture] });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Cancelar')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Cancelar'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(hoje.resolveFollowUp).not.toHaveBeenCalled();
    });

    it("Dado clique em Concluir com sucesso, Quando executado, Então exibe toast de sucesso 'Retorno concluído'", async () => {
      mockHojeData({ followUps: [followUpFixture] });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Concluir')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Concluir'));

      await waitFor(() => {
        expect(screen.getByText('Retorno concluído')).toBeInTheDocument();
      });
    });

    it("Dado clique em Cancelar com sucesso, Quando executado, Então exibe toast de sucesso 'Retorno cancelado'", async () => {
      mockHojeData({ followUps: [followUpFixture] });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Cancelar')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Cancelar'));
      fireEvent.click(await screen.findByText('Cancelar retorno'));

      await waitFor(() => {
        expect(screen.getByText('Retorno cancelado')).toBeInTheDocument();
      });
    });

    it('Dado falha ao concluir retorno, Quando acionado, Então exibe toast de erro', async () => {
      mockHojeData({ followUps: [followUpFixture] });
      hoje.resolveFollowUp.mockResolvedValue({
        success: false,
        data: null,
        error: 'Erro ao atualizar retorno',
      });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Concluir')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Concluir'));

      await waitFor(() => {
        expect(
          screen.getByText('Erro ao atualizar retorno'),
        ).toBeInTheDocument();
      });
    });

    it('Dado que a ação de concluir nem chega ao servidor, Quando acionado, Então exibe o toast de erro padrão', async () => {
      mockHojeData({ followUps: [followUpFixture] });
      hoje.resolveFollowUp.mockRejectedValue('falha de rede');
      await renderPage();

      fireEvent.click(await screen.findByText('Concluir'));

      expect(
        await screen.findByText('Erro ao atualizar retorno'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: erro de API por card (DASH-01)', () => {
    it('Dado falha na API de retornos, Quando renderizar, Então mostra ErrorAlert no card em vez de lista vazia', async () => {
      mockHojeData({ followUpsError: 'Erro ao buscar retornos' });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Erro ao buscar retornos')).toBeInTheDocument();
      });
      expect(
        screen.queryByText('Nenhum retorno pendente.'),
      ).not.toBeInTheDocument();
    });

    it('Dado falha na API de estoque, Quando renderizar, Então mostra ErrorAlert no card em vez de lista vazia', async () => {
      mockHojeData({ suppliesError: 'Erro ao buscar estoque' });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Erro ao buscar estoque')).toBeInTheDocument();
      });
      expect(
        screen.queryByText('Nenhum insumo abaixo do mínimo.'),
      ).not.toBeInTheDocument();
    });

    it('Dado retornos e estoque falhando ao mesmo tempo, Quando renderizar, Então cada card mostra seu próprio erro isolado', async () => {
      mockHojeData({
        followUpsError: 'Erro retornos',
        suppliesError: 'Erro estoque',
      });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Erro retornos')).toBeInTheDocument();
      });
      expect(screen.getByText('Erro estoque')).toBeInTheDocument();
    });

    it("Dado erro no card de retornos, Quando clicar em 'Tentar novamente', Então refaz a busca", async () => {
      mockHojeData({ followUpsError: 'Erro ao buscar retornos' });
      await renderPage();

      await screen.findByText('Erro ao buscar retornos');
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      // A busca é refeita no servidor: o navegador pede a tela de novo.
      await waitFor(() => {
        expect(hoje.refresh).toHaveBeenCalled();
      });
    });
  });

  describe('Cenário: fila de triagem em faixa própria (DASH-02)', () => {
    it('Dado fila de triagem não-vazia, Quando renderizar, Então o heading de retornos pendentes vem antes do da fila (a agenda é o primeiro conteúdo estável, #548)', async () => {
      mockHojeData({ triage: [triageFixture], followUps: [followUpFixture] });
      await renderPage();

      await screen.findByText(/aguardando triagem/);
      const headings = screen.getAllByRole('heading');
      const triageIndex = headings.findIndex((h) =>
        /aguardando triagem/.test(h.textContent ?? ''),
      );
      const followUpsIndex = headings.findIndex(
        (h) => h.textContent === 'Retornos pendentes',
      );

      expect(followUpsIndex).toBeGreaterThanOrEqual(0);
      expect(triageIndex).toBeGreaterThan(followUpsIndex);
    });
  });

  describe('Cenário: KPIs navegáveis e título compacto (DASH-04/06)', () => {
    it('Dado o dashboard carregado, Quando renderizar, Então cada KPI é um link com aria-label descritivo', async () => {
      mockHojeData();
      await renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('link', { name: /^Recebido no mês/ }),
        ).toHaveAttribute('href', '/faturamento');
      });
      expect(
        screen.getByRole('link', { name: /^Consultas no mês/ }),
      ).toHaveAttribute('href', '/agenda');
    });

    it('Dado o dashboard carregado, Quando renderizar, Então o título é um h1 compacto sem Hero de landing page', async () => {
      mockHojeData();
      await renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { level: 1, name: 'Hoje' }),
        ).toBeInTheDocument();
      });
      expect(
        document.querySelector('.sv-hero__eyebrow'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Cenário: fila de triagem de fotos', () => {
    it('Dado fila vazia, Quando renderizar, Então não exibe a seção de triagem', async () => {
      mockHojeData();
      await renderPage();

      await waitFor(() => {
        expect(
          screen.getByText('Nenhum retorno pendente.'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(/aguardando triagem/)).not.toBeInTheDocument();
    });

    it('Dado fotos aguardando triagem, Quando renderizar, Então exibe a fila com paciente e observação', async () => {
      mockHojeData({ triage: [triageFixture] });
      await renderPage();

      await waitFor(() => {
        expect(
          screen.getByText(/aguardando triagem \(1\)/),
        ).toBeInTheDocument();
      });
      expect(screen.getAllByText(/Maria Souza/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Está coçando/)).toBeInTheDocument();
    });

    it('Dado pendência antiga e score da condição, Quando renderizar, Então mostra idade destacada e badge do score (COMP3-04/06)', async () => {
      mockHojeData({
        triage: [
          {
            ...triageFixture,
            waitingHours: 30,
            latestScore: { kind: 'push', value: 9 },
          },
        ],
      });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('PUSH 9')).toBeInTheDocument();
      });
      const waiting = screen.getByText(/aguardando há 30h/);
      // `text-danger` é o token semântico do Still Void (var(--sv-danger-ink)),
      // que substituiu o degrau cru text-red-700 na migração para a v2.
      expect(waiting).toHaveClass('text-danger');
    });

    it('Dado score de triagem, Quando focar o selo via teclado, Então mostra a legenda no tooltip', async () => {
      mockHojeData({
        triage: [
          {
            ...triageFixture,
            waitingHours: 30,
            latestScore: { kind: 'push', value: 9 },
          },
        ],
      });
      await renderPage();

      const badge = await screen.findByText('PUSH 9');
      badge.focus();

      expect(
        await screen.findByText(/Pressure Ulcer Scale for Healing/),
      ).toBeInTheDocument();
    });

    it('Dado pendência recente sem score, Quando renderizar, Então idade sem destaque e sem badge (COMP3-05)', async () => {
      mockHojeData({ triage: [triageFixture] });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText(/aguardando há 2h/)).toBeInTheDocument();
      });
      expect(screen.getByText(/aguardando há 2h/)).not.toHaveClass(
        'text-danger',
      );
      expect(screen.queryByText(/PUSH|DET/)).not.toBeInTheDocument();
    });

    it("Dado clique em 'Ok, manter plano', Quando acionado, Então envia triagem reviewed", async () => {
      mockHojeData({ triage: [triageFixture] });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Ok, manter plano'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(hoje.decideTriage).toHaveBeenCalledWith({
          id: 'photo-1',
          decision: 'reviewed',
        });
      });
      expect(await screen.findByText('Foto revisada')).toBeInTheDocument();
    });

    it("Dado clique em 'Antecipar retorno', Quando acionado, Então envia triagem escalated", async () => {
      mockHojeData({ triage: [triageFixture] });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Antecipar retorno')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Antecipar retorno'));
      fireEvent.click(await screen.findByText('Confirmar antecipação'));

      await waitFor(() => {
        expect(hoje.decideTriage).toHaveBeenCalledWith({
          id: 'photo-1',
          decision: 'escalated',
        });
      });
      expect(await screen.findByText('Foto escalada')).toBeInTheDocument();
    });

    it("Dado clique em 'Ok, manter plano' seguido de cancelamento, Quando acionado, Então não chama a ação", async () => {
      mockHojeData({ triage: [triageFixture] });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Ok, manter plano'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(hoje.decideTriage).not.toHaveBeenCalled();
    });

    it("Dado clique em 'Antecipar retorno' seguido de cancelamento, Quando acionado, Então não chama a ação", async () => {
      mockHojeData({ triage: [triageFixture] });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Antecipar retorno')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Antecipar retorno'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(hoje.decideTriage).not.toHaveBeenCalled();
    });

    it("Dado foto sem observação do paciente, Quando renderizar, Então exibe 'sem observação'", async () => {
      mockHojeData({ triage: [{ ...triageFixture, patientNote: null }] });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText(/sem observação/)).toBeInTheDocument();
      });
    });

    it('Dado erro não padronizado (sem instância de Error) na triagem, Quando acionar decisão, Então exibe mensagem padrão de erro', async () => {
      mockHojeData({ triage: [triageFixture] });
      // Rejeição não padronizada de propósito: o cliente precisa lidar com
      // throw de string, não só de Error.
      hoje.decideTriage.mockRejectedValue('falha inesperada');
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Ok, manter plano'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(screen.getByText('Erro na triagem')).toBeInTheDocument();
      });
    });

    it('Dado falha na triagem, Quando acionar decisão, Então exibe alerta de erro', async () => {
      mockHojeData({ triage: [triageFixture] });
      hoje.decideTriage.mockResolvedValue({
        success: false,
        data: null,
        error: 'Erro na triagem',
      });
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Ok, manter plano'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(screen.getByText('Erro na triagem')).toBeInTheDocument();
      });
    });

    it('Dado falha na leitura da triagem, Quando renderizar, Então mostra ErrorAlert com opção de retry em vez de esconder a seção', async () => {
      mockHojeData({ triageError: 'Erro ao buscar fila de triagem' });
      await renderPage();

      await waitFor(() => {
        expect(
          screen.getByText('Erro ao buscar fila de triagem'),
        ).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      await waitFor(() => {
        expect(hoje.refresh).toHaveBeenCalled();
      });
    });

    it('Dado fila de triagem carregando, Quando renderizar, Então a seção não reserva espaço enquanto carrega (sem salto se a fila vier vazia)', async () => {
      mockHojeData({ triage: [triageFixture] });

      // A faixa de triagem é opcional: carrega sem moldura nem indicador,
      // para a tela não saltar quando a fila vem vazia.
      const fallbacks = suspenseFallbacks(await DashboardPage());

      expect(fallbacks.some((fallback) => fallback === null)).toBe(true);
    });

    it('Dado clique na miniatura da foto, Quando acionado, Então abre a foto ampliada em um modal', async () => {
      mockHojeData({ triage: [triageFixture] });
      await renderPage();

      const thumbnail = await screen.findByRole('button', {
        name: 'Ampliar foto de Maria Souza',
      });
      fireEvent.click(thumbnail);

      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByRole('heading', { name: 'Foto de Maria Souza' }),
      ).toBeInTheDocument();
    });

    it("Dado botão 'Ok, manter plano', Quando renderizar, Então usa cor de risco (é ação irreversível)", async () => {
      mockHojeData({ triage: [triageFixture] });
      await renderPage();

      const keepPlanButton = await screen.findByText('Ok, manter plano');
      expect(keepPlanButton).toHaveClass('text-danger');
    });

    it("Dado botão 'Antecipar retorno', Quando renderizar, Então usa cor neutra/positiva (é a ação protetora)", async () => {
      mockHojeData({ triage: [triageFixture] });
      await renderPage();

      const escalateButton = await screen.findByText('Antecipar retorno');
      expect(escalateButton).toHaveClass('text-success');
    });
  });

  describe('Cenário: cor semântica dos cards de KPI (DASH-06)', () => {
    it('Dado resumo financeiro, Quando renderizar, Então "Recebido no mês" usa tom de sucesso', async () => {
      mockHojeData();
      await renderPage();

      const value = await screen.findByText('R$ 1.500,00');
      expect(value).toHaveClass('text-success');
    });

    it('Dado resumo financeiro, Quando renderizar, Então "A receber" e "Faturas pendentes" usam tom de alerta', async () => {
      mockHojeData();
      await renderPage();

      const pending = await screen.findByText('R$ 500,00');
      expect(pending).toHaveClass('text-warning');
      const pendingCount = await screen.findByText('3');
      expect(pendingCount).toHaveClass('text-warning');
    });
  });

  describe('Cenário: banner de triagem usa token de urgência clínica', () => {
    it('Dado fotos aguardando triagem, Quando renderizar, Então o heading usa text-warning (não accent de marca)', async () => {
      mockHojeData({ triage: [triageFixture] });
      await renderPage();

      const heading = await screen.findByText(/aguardando triagem \(1\)/);
      expect(heading).toHaveClass('text-warning');
    });
  });

  describe('Cenário: cap da fila de triagem, com link pra página completa (issue #135)', () => {
    it('Dado mais de 8 fotos aguardando triagem, Quando renderizar, Então mostra a contagem total mas renderiza no máximo 8 itens', async () => {
      const photos = Array.from({ length: 9 }, (_, i) => ({
        ...triageFixture,
        id: `photo-${i}`,
        patientName: `Paciente ${i}`,
      }));
      mockHojeData({ triage: photos });
      await renderPage();

      await screen.findByText(/aguardando triagem \(9\)/);
      expect(
        screen.getAllByText(/^Paciente \d — Ferida perna E$/),
      ).toHaveLength(8);
    });

    it('Dado fotos aguardando triagem, Quando renderizar, Então mostra link "Ver todas as fotos" apontando pra /triagem', async () => {
      mockHojeData({ triage: [triageFixture] });
      await renderPage();

      const link = await screen.findByRole('link', {
        name: /Ver todas as fotos/,
      });
      expect(link).toHaveAttribute('href', '/triagem');
    });
  });

  describe('Cenário: feedback de processamento evita duplo-clique', () => {
    it("Dado clique em 'Ok, manter plano', Quando a ação ainda está em voo, Então desabilita os dois botões de ação e mostra 'Enviando…'", async () => {
      let resolveAction: (() => void) | undefined;
      mockHojeData({ triage: [triageFixture] });
      hoje.decideTriage.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAction = () =>
              resolve({ success: true, data: null, error: null });
          }),
      );
      await renderPage();

      await waitFor(() => {
        expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Ok, manter plano'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(screen.getAllByText('Enviando…')).toHaveLength(2);
      });
      for (const button of screen.getAllByRole('button', {
        name: 'Enviando…',
      })) {
        expect(button).toBeDisabled();
      }

      resolveAction?.();
      await screen.findByText('Foto revisada');
    });

    it("Dado clique em 'Concluir' em retorno pendente, Quando a ação ainda está em voo, Então desabilita o botão e mostra 'Enviando…'", async () => {
      let resolveAction: (() => void) | undefined;
      mockHojeData({ followUps: [followUpFixture] });
      hoje.resolveFollowUp.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAction = () =>
              resolve({ success: true, data: null, error: null });
          }),
      );
      await renderPage();

      const concludeButton = await screen.findByText('Concluir');
      fireEvent.click(concludeButton);

      await waitFor(() => {
        expect(screen.getByText('Enviando…')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();

      resolveAction?.();
      await screen.findByText('Retorno concluído');
    });
  });
});
