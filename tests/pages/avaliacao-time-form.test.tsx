// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { ConditionsSection } from '@/app/(staff)/pacientes/[id]/conditions-section';
import type { AssessmentDto, ConditionDto } from '@/lib/dto';

const wound: ConditionDto = {
  id: 'cond-wound',
  patientId: 'pac-1',
  kind: 'wound',
  title: 'Úlcera venosa perna E',
  stomaType: null,
  startedAt: '2026-01-01T00:00:00.000Z',
  notes: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const oldAssessment: AssessmentDto = {
  id: 'a-old',
  conditionId: 'cond-wound',
  lengthMm: 20,
  widthMm: 10,
  depthMm: 2,
  areaMm2: 200,
  tissueType: 'granulation',
  exudate: 'low',
  painScale: 2,
  skinCondition: null,
  complications: null,
  complicationCodes: [],
  detScore: null,
  pushScore: 7,
  notes: null,
  createdAt: '2026-02-01T10:00:00.000Z',
};

const timeAssessment: AssessmentDto = {
  ...oldAssessment,
  id: 'a-time',
  infectionLevel: 'local',
  infectionSigns: ['erythema', 'malodor'],
  woundEdges: 'rolled',
  exudateType: 'purulent',
  granulationPct: 60,
  sloughPct: 40,
  createdAt: '2026-02-08T10:00:00.000Z',
};

const envelope = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data, error: null }), {
    status: 200,
  });

function stubFetch(assessments: AssessmentDto[]) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/assessments') && init?.method === 'POST') {
      return envelope({ ...timeAssessment, id: 'a-new' });
    }
    if (url.endsWith('/assessments')) return envelope(assessments);
    return envelope([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSection() {
  return renderWithToast(
    <ConditionsSection
      patientId="pac-1"
      conditions={[wound]}
      error={null}
      isLoading={false}
      onChanged={() => undefined}
      onRetry={() => undefined}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: TIME completo no formulário e na tabela de avaliações (#464)', () => {
  it('Dado ferida, Quando abrir + Avaliação, Então mostra Infecção/Inflamação, Bordas, tipo de exsudato e tecido em %', () => {
    stubFetch([]);
    renderSection();

    fireEvent.click(screen.getByText('+ Avaliação'));

    expect(screen.getByText('Infecção / Inflamação')).toBeInTheDocument();
    expect(screen.getByLabelText('Nível')).toBeInTheDocument();
    expect(screen.getByLabelText('Bordas')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de exsudato')).toBeInTheDocument();
    expect(screen.getByLabelText('Granulação (%)')).toBeInTheDocument();
    expect(screen.getByLabelText('Pele perilesional')).toBeInTheDocument();
  });

  it('Dado o TIME preenchido, Quando registrar, Então envia infecção, sinais, bordas, exsudato e percentuais', async () => {
    const fetchMock = stubFetch([]);
    renderSection();
    fireEvent.click(screen.getByText('+ Avaliação'));

    fireEvent.change(screen.getByLabelText('Nível'), {
      target: { value: 'local' },
    });
    fireEvent.click(screen.getByText('Eritema'));
    fireEvent.click(screen.getByText('Odor fétido'));
    fireEvent.click(screen.getByText('Febre'));
    fireEvent.click(screen.getByText('Febre')); // desmarca
    fireEvent.change(screen.getByLabelText('Bordas'), {
      target: { value: 'macerated' },
    });
    fireEvent.change(screen.getByLabelText('Tipo de exsudato'), {
      target: { value: 'purulent' },
    });
    fireEvent.change(screen.getByLabelText('Granulação (%)'), {
      target: { value: '60' },
    });
    fireEvent.change(screen.getByLabelText('Epitelização (%)'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('Esfacelo (%)'), {
      target: { value: '40' },
    });
    fireEvent.change(screen.getByLabelText('Pele perilesional'), {
      target: { value: 'Macerada' },
    });
    fireEvent.click(screen.getByText('Registrar avaliação'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/conditions/cond-wound/assessments',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const [, init] = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === '/api/conditions/cond-wound/assessments' &&
        options?.method === 'POST',
    ) as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      infectionLevel: 'local',
      infectionSigns: 'erythema,malodor',
      woundEdges: 'macerated',
      exudateType: 'purulent',
      granulationPct: 60,
      epithelialPct: 0,
      sloughPct: 40,
      necroticPct: null,
      skinCondition: 'Macerada',
    });
  });

  it('Dado o TIME em branco, Quando registrar, Então envia os campos novos como nulos', async () => {
    const fetchMock = stubFetch([]);
    renderSection();
    fireEvent.click(screen.getByText('+ Avaliação'));

    fireEvent.click(screen.getByText('Registrar avaliação'));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === 'POST'),
      ).toBe(true);
    });
    const [, init] = fetchMock.mock.calls.find(
      ([, options]) => options?.method === 'POST',
    ) as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      infectionLevel: null,
      infectionSigns: null,
      woundEdges: null,
      exudateType: null,
      granulationPct: null,
      epithelialPct: null,
      sloughPct: null,
      necroticPct: null,
    });
  });

  it('Dado avaliação nova e antiga, Quando ver avaliações, Então a nova mostra infecção local e bordas em epíbole e a antiga traço', async () => {
    stubFetch([timeAssessment, oldAssessment]);
    renderSection();

    fireEvent.click(screen.getByText('Ver avaliações'));

    expect(
      await screen.findByText('Infecção local · Bordas: epíbole (enroladas)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Granulação 60% · Esfacelo 40%'),
    ).toBeInTheDocument();
    expect(screen.getByText('Purulento')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('Dado avaliação só com nível de infecção, Quando ver avaliações, Então mostra só o nível', async () => {
    stubFetch([{ ...oldAssessment, infectionLevel: 'inflammation' }]);
    renderSection();

    fireEvent.click(screen.getByText('Ver avaliações'));

    expect(await screen.findByText('Inflamação')).toBeInTheDocument();
  });
});
