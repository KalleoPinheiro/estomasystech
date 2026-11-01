// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Loading from '@/app/(staff)/loading';
import TriagePage from '@/app/(staff)/triagem/page';
import { ValidationError } from '@/domain/shared/errors';
import type { TriagePhotoDto } from '@/lib/dto';
import { renderServerPage } from '../support/server-page';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  requireStaffPageFor: vi.fn(),
  buildLinkedTriageQueue: vi.fn(),
  decideTriage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
  usePathname: () => '/triagem',
}));
vi.mock('@/lib/server/session', () => ({
  requireStaffPageFor: mocks.requireStaffPageFor,
}));
vi.mock('@/lib/server/data/triage', () => ({
  buildLinkedTriageQueue: mocks.buildLinkedTriageQueue,
}));
vi.mock('@/app/(staff)/hoje-actions', () => ({
  decideTriage: mocks.decideTriage,
}));

const triageFixture: TriagePhotoDto = {
  id: 'photo-1',
  conditionTitle: 'Ferida perna E',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  patientNote: 'Está coçando',
  createdAt: '2026-07-18T10:00:00.000Z',
  waitingHours: 2,
  latestScore: null,
};

/** A fila vem do servidor: a página lê a camada de dados, não faz `fetch`. */
function mockQueue(
  options: { triage?: TriagePhotoDto[]; triageError?: string } = {},
) {
  const { triage = [], triageError } = options;
  mocks.requireStaffPageFor.mockResolvedValue({
    role: 'profissional',
    subject: 'pro@clinica.com',
  });
  mocks.buildLinkedTriageQueue.mockImplementation(async () => {
    if (triageError) throw new ValidationError(triageError);
    return triage;
  });
  mocks.decideTriage.mockResolvedValue({
    success: true,
    data: null,
    error: null,
  });
}

beforeEach(() => {
  mocks.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Feature: Página de triagem (/triagem, issue #135)', () => {
  it('Dado a rota em carregamento, Quando o servidor ainda responde, Então a fronteira da rota exibe o indicador de carregamento', () => {
    render(<Loading />);

    expect(screen.getByText('Carregando…')).toBeInTheDocument();
  });

  it('Dado falha na leitura, Quando renderizar, Então exibe alerta de erro com retry', async () => {
    mockQueue({ triageError: 'Erro ao buscar fila de triagem' });
    await renderServerPage(TriagePage);

    await screen.findByText('Erro ao buscar fila de triagem');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => {
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it('Dado fila vazia, Quando renderizar, Então exibe estado vazio', async () => {
    mockQueue();
    await renderServerPage(TriagePage);

    await waitFor(() => {
      expect(
        screen.getByText('Nenhuma foto aguardando triagem.'),
      ).toBeInTheDocument();
    });
  });

  it('Dado muitas fotos aguardando triagem, Quando renderizar, Então lista todas (sem cap, diferente do resumo no dashboard)', async () => {
    const photos = Array.from({ length: 12 }, (_, i) => ({
      ...triageFixture,
      id: `photo-${i}`,
      patientName: `Paciente ${i}`,
    }));
    mockQueue({ triage: photos });
    await renderServerPage(TriagePage);

    await waitFor(() => {
      expect(
        screen.getAllByText(/^Paciente \d+ — Ferida perna E$/),
      ).toHaveLength(12);
    });
  });

  it("Dado clique em 'Ok, manter plano', Quando confirmado, Então envia triagem reviewed", async () => {
    mockQueue({ triage: [triageFixture] });
    await renderServerPage(TriagePage);

    await waitFor(() => {
      expect(screen.getByText('Ok, manter plano')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Ok, manter plano'));
    fireEvent.click(await screen.findByText('Confirmar'));

    await waitFor(() => {
      expect(mocks.decideTriage).toHaveBeenCalledWith({
        id: 'photo-1',
        decision: 'reviewed',
      });
    });
    expect(await screen.findByText('Foto revisada')).toBeInTheDocument();
  });

  it('Dado clique na miniatura, Quando acionado, Então abre a foto ampliada em um modal', async () => {
    mockQueue({ triage: [triageFixture] });
    await renderServerPage(TriagePage);

    const thumbnail = await screen.findByRole('button', {
      name: 'Ampliar foto de Maria Souza',
    });
    fireEvent.click(thumbnail);

    expect(
      await screen.findByRole('heading', { name: 'Foto de Maria Souza' }),
    ).toBeInTheDocument();
  });

  it('Dado foto ampliada, Quando fechar o modal, Então volta pra lista', async () => {
    mockQueue({ triage: [triageFixture] });
    await renderServerPage(TriagePage);

    const thumbnail = await screen.findByRole('button', {
      name: 'Ampliar foto de Maria Souza',
    });
    fireEvent.click(thumbnail);
    await screen.findByRole('heading', { name: 'Foto de Maria Souza' });

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Foto de Maria Souza' }),
      ).not.toBeInTheDocument();
    });
  });
});
