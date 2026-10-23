// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConditionProgress,
  type ConditionWithAssessmentsDto,
} from '@/app/portal/condition-progress';
import type { ConditionDto, PortalAssessmentDto } from '@/lib/dto';
import { formatDate } from '@/lib/format';

afterEach(cleanup);

const condition: ConditionDto = {
  id: 'cond-1',
  patientId: 'pac-1',
  kind: 'wound',
  title: 'Úlcera venosa',
  stomaType: null,
  startedAt: '2026-01-01T00:00:00.000Z',
  notes: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function medicao(overrides: Partial<PortalAssessmentDto>): PortalAssessmentDto {
  return {
    id: 'a',
    conditionId: 'cond-1',
    lengthMm: null,
    widthMm: null,
    depthMm: null,
    areaMm2: null,
    tissueType: null,
    exudate: null,
    painScale: null,
    skinCondition: null,
    complicationCodes: [],
    detScore: null,
    pushScore: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as PortalAssessmentDto;
}

function renderMedicoes(assessments: PortalAssessmentDto[]) {
  const entry: ConditionWithAssessmentsDto = { condition, assessments };
  render(<ConditionProgress {...entry} />);
  return screen.getByRole('list', { name: 'Medições registradas' });
}

describe('Feature: Lista textual das medições no portal (#517)', () => {
  it('Dado duas medições, Quando renderizar, Então cada cartão traz a data e a tendência da área', () => {
    const lista = renderMedicoes([
      medicao({
        id: 'a1',
        areaMm2: 100,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      medicao({ id: 'a2', areaMm2: 80, createdAt: '2026-01-10T00:00:00.000Z' }),
    ]);

    const [primeira, segunda] = within(lista).getAllByRole('listitem');
    expect(primeira).toHaveTextContent(formatDate('2026-01-01T00:00:00.000Z'));
    expect(primeira).not.toHaveTextContent('desde a anterior');
    expect(segunda).toHaveTextContent('Área ↓ 20% desde a anterior');
  });

  it('Dado a área maior que a anterior, Quando renderizar, Então a tendência é de aumento', () => {
    const lista = renderMedicoes([
      medicao({
        id: 'a1',
        areaMm2: 100,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      medicao({
        id: 'a2',
        areaMm2: 150,
        createdAt: '2026-01-10T00:00:00.000Z',
      }),
    ]);

    expect(lista).toHaveTextContent('Área ↑ 50% desde a anterior');
  });

  it('Dado a mesma área da anterior, Quando renderizar, Então diz que está igual', () => {
    const lista = renderMedicoes([
      medicao({
        id: 'a1',
        areaMm2: 100,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      medicao({
        id: 'a2',
        areaMm2: 100,
        createdAt: '2026-01-10T00:00:00.000Z',
      }),
    ]);

    expect(lista).toHaveTextContent('Área igual à anterior');
  });

  it('Dado duas medições no mesmo instante, Quando renderizar, Então não afirma tendência (ordem ambígua)', () => {
    const lista = renderMedicoes([
      medicao({ id: 'a1', areaMm2: 100 }),
      medicao({ id: 'a2', areaMm2: 40 }),
    ]);

    expect(lista).not.toHaveTextContent('desde a anterior');
  });

  it('Dado a medição anterior com área zerada, Quando renderizar, Então não calcula porcentagem', () => {
    const lista = renderMedicoes([
      medicao({ id: 'a1', areaMm2: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
      medicao({ id: 'a2', areaMm2: 40, createdAt: '2026-01-10T00:00:00.000Z' }),
    ]);

    expect(lista).not.toHaveTextContent('desde a anterior');
  });
});
