// @vitest-environment jsdom

import { ToastProvider } from '@still-void/ui/react/client';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PackagesSection } from '@/app/(staff)/pacientes/[id]/packages-section';

const catalog = vi.hoisted(() => ({ error: null as string | null }));
vi.mock('@/lib/use-api-query', () => ({
  useApiQuery: () => ({
    data: [
      {
        id: 'proc-1',
        name: 'Curativo',
        priceCents: 30_000,
        durationMinutes: 30,
        active: true,
      },
      {
        id: 'proc-2',
        name: 'Antigo',
        priceCents: 1_000,
        durationMinutes: 30,
        active: false,
      },
    ],
    error: catalog.error,
    refresh: vi.fn(),
  }),
}));

const fetchMock = vi.fn();
const click = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:proposta');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
  click.mockReset();
  catalog.error = null;
});

const renderSection = (canPropose: boolean) =>
  render(
    <ToastProvider>
      <PackagesSection
        packages={{ data: [], error: null }}
        patientId="p-1"
        canPropose={canPropose}
      />
    </ToastProvider>,
  );

const fill = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillRequired() {
  fill(/Procedimento/, 'proc-1');
  fill(/Preço do plano/, '1000');
  fill(/Objetivo do acompanhamento/, 'Cicatrizar a lesão');
}

describe('Feature: formulário da proposta do plano (#964)', () => {
  it('fica escondido para quem não é Admin', () => {
    renderSection(false);
    expect(screen.queryByText('Proposta de plano (PDF)')).toBeNull();
  });

  it('lista só procedimentos ativos com o preço avulso', () => {
    renderSection(true);
    expect(
      screen.getByRole('option', { name: /Curativo/ }).textContent,
    ).toContain('avulsa');
    expect(screen.queryByRole('option', { name: /Antigo/ })).toBeNull();
  });

  it('envia o preenchido, troca vazio por null e baixa o PDF', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['%PDF-']),
    });
    renderSection(true);
    fillRequired();
    fill(/Formas de pagamento/, 'Pix');
    fill(/Reavaliação/, '2026-12-20');
    fireEvent.click(
      screen.getByRole('button', { name: 'Gerar proposta (PDF)' }),
    );

    await waitFor(() => expect(click).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/packages/proposta');
    expect(JSON.parse(init.body as string)).toEqual({
      patientId: 'p-1',
      procedureId: 'proc-1',
      totalSessions: 4,
      priceCents: 100_000,
      reassessmentOn: '2026-12-20',
      objective: 'Cicatrizar a lesão',
      frequency: null,
      duration: null,
      modality: null,
      therapies: null,
      materials: null,
      payment: 'Pix',
      emergencyContact: null,
    });
    expect(await screen.findByText('Proposta gerada')).toBeTruthy();
  });

  it('mostra o erro da rota', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: 'Complete os dados',
        }),
        {
          status: 400,
        },
      ),
    );
    renderSection(true);
    fillRequired();
    fireEvent.click(
      screen.getByRole('button', { name: 'Gerar proposta (PDF)' }),
    );
    expect(await screen.findByText('Complete os dados')).toBeTruthy();
    expect(click).not.toHaveBeenCalled();
  });

  it('resposta sem JSON vira erro genérico', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }));
    renderSection(true);
    fillRequired();
    fireEvent.click(
      screen.getByRole('button', { name: 'Gerar proposta (PDF)' }),
    );
    expect(await screen.findByText('Erro ao gerar a proposta')).toBeTruthy();
  });

  it('falha de rede mostra a mensagem', async () => {
    fetchMock.mockRejectedValue(new Error('rede caiu'));
    renderSection(true);
    fillRequired();
    fireEvent.click(
      screen.getByRole('button', { name: 'Gerar proposta (PDF)' }),
    );
    expect(await screen.findByText('rede caiu')).toBeTruthy();
  });

  it('erro do catálogo aparece', () => {
    catalog.error = 'Falha ao carregar procedimentos';
    renderSection(true);
    expect(screen.getByText('Falha ao carregar procedimentos')).toBeTruthy();
  });
});
