// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { ConditionsSection } from '@/app/(staff)/pacientes/[id]/conditions-section';
import type { ConditionDto } from '@/lib/dto';

vi.mock(
  '@/app/(staff)/pacientes/[id]/actions/cadastro',
  async () => (await import('../support/ficha-actions-via-fetch')).cadastro,
);
vi.mock(
  '@/app/(staff)/pacientes/[id]/actions/prontuario',
  async () => (await import('../support/ficha-actions-via-fetch')).prontuario,
);
vi.mock(
  '@/app/(staff)/pacientes/[id]/actions/plano-cuidados',
  async () =>
    (await import('../support/ficha-actions-via-fetch')).planoCuidados,
);
vi.mock(
  '@/app/(staff)/pacientes/[id]/actions/consentimento',
  async () =>
    (await import('../support/ficha-actions-via-fetch')).consentimento,
);

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

const SUM_ERROR = 'A soma dos percentuais de tecido não pode passar de 100%';

/** Lista vazia nas leituras; o POST da avaliação recusa com a mensagem do domínio. */
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? new Response(
            JSON.stringify({ success: false, data: null, error: SUM_ERROR }),
            { status: 400 },
          )
        : new Response(
            JSON.stringify({ success: true, data: [], error: null }),
            { status: 200 },
          ),
    ),
  );
}

function openAssessmentForm() {
  stubFetch();
  renderWithToast(
    <ConditionsSection
      patientId="pac-1"
      conditions={[wound]}
      error={null}
      isLoading={false}
      onChanged={() => undefined}
      onRetry={() => undefined}
    />,
  );
  fireEvent.click(screen.getByText('+ Avaliação'));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: critérios legíveis na avaliação de ferida (#955)', () => {
  it('Dado o formulário vazio, Então o exsudato mostra as faixas de saturação da cobertura', () => {
    openAssessmentForm();
    expect(screen.getByLabelText('Exsudato')).toHaveAccessibleDescription(
      'Pela saturação da cobertura: baixo menos de 25%, moderado de 25% a 75%, alto mais de 75%.',
    );
  });

  it('Dado uma opção escolhida, Quando mudar o campo, Então a legenda mostra o critério dela', () => {
    openAssessmentForm();
    fireEvent.change(screen.getByLabelText('Exsudato'), {
      target: { value: 'moderate' },
    });
    fireEvent.change(screen.getByLabelText('Tecido predominante'), {
      target: { value: 'slough' },
    });
    fireEvent.change(screen.getByLabelText('Nível'), {
      target: { value: 'systemic' },
    });
    fireEvent.change(screen.getByLabelText('Aspecto da drenagem'), {
      target: { value: 'serous' },
    });
    fireEvent.change(screen.getByLabelText('Bordas'), {
      target: { value: 'rolled' },
    });

    expect(screen.getByLabelText('Exsudato')).toHaveAccessibleDescription(
      'De 25% a 75% da cobertura saturada.',
    );
    expect(
      screen.getByLabelText('Tecido predominante'),
    ).toHaveAccessibleDescription(
      'Tecido amarelo ou esbranquiçado, aderido ao leito, mole ou fibroso.',
    );
    expect(screen.getByLabelText('Nível')).toHaveAccessibleDescription(
      /encaminhar na hora/,
    );
    expect(
      screen.getByLabelText('Aspecto da drenagem'),
    ).toHaveAccessibleDescription('Claro e aquoso, cor de palha.');
    expect(screen.getByLabelText('Bordas')).toHaveAccessibleDescription(
      'Borda enrolada para dentro e espessa, que trava a epitelização.',
    );
  });

  it('Dado percentuais de tecido, Quando a soma fica até 100%, Então mostra a soma sem aviso', () => {
    openAssessmentForm();
    expect(screen.queryByText(/^Soma:/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Granulação (%)'), {
      target: { value: '60' },
    });
    fireEvent.change(screen.getByLabelText('Esfacelo (%)'), {
      target: { value: '40' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Soma: 100%');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Dado percentuais de tecido, Quando a soma passa de 100%, Então avisa antes de registrar', () => {
    openAssessmentForm();
    fireEvent.change(screen.getByLabelText('Granulação (%)'), {
      target: { value: '70' },
    });
    fireEvent.change(screen.getByLabelText('Necrose (%)'), {
      target: { value: '50' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Soma: 120%. Passa de 100%: ajuste os percentuais antes de registrar.',
    );
  });
});

describe('Feature: ajustes da validação limpa do #955', () => {
  it('Dado aviso de coerência da infecção, Então a lista mantém a semântica dentro da região de status', () => {
    openAssessmentForm();
    fireEvent.change(screen.getByLabelText('Nível'), {
      target: { value: 'local' },
    });
    fireEvent.click(screen.getByText('Febre'));

    const status = screen.getByRole('status');
    expect(status.tagName).toBe('DIV');
    const list = within(status).getByRole('list');
    expect(list).not.toHaveAttribute('role');
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('Dado a recusa da soma acima de 100%, Quando corrigir para 100%, Então a faixa de erro some', async () => {
    openAssessmentForm();
    fireEvent.change(screen.getByLabelText('Granulação (%)'), {
      target: { value: '70' },
    });
    fireEvent.change(screen.getByLabelText('Necrose (%)'), {
      target: { value: '50' },
    });
    fireEvent.click(screen.getByText('Registrar avaliação'));
    expect(await screen.findByText(SUM_ERROR)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Necrose (%)'), {
      target: { value: '40' },
    });
    expect(screen.getByText(/^Soma: 110%/)).toBeInTheDocument();
    expect(screen.getByText(SUM_ERROR)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Necrose (%)'), {
      target: { value: '30' },
    });
    await waitFor(() => {
      expect(screen.queryByText(SUM_ERROR)).not.toBeInTheDocument();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Soma: 100%');
  });
});
