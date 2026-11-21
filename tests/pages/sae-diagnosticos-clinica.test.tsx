// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { ClinicDiagnosesSection } from '@/app/(staff)/configuracoes/clinic-diagnoses-section';
import { AddDiagnosisForm } from '@/app/(staff)/pacientes/[id]/care-plans-section';
import type { ClinicNursingDiagnosisDto } from '@/lib/dto';

const settings = vi.hoisted(() => ({
  create: vi.fn(),
  importCsv: vi.fn(),
  setActive: vi.fn(),
}));
const plan = vi.hoisted(() => ({ add: vi.fn() }));
const queries = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));

vi.mock('@/app/(staff)/configuracoes/diagnosticos/diagnosis-actions', () => ({
  createClinicDiagnosis: settings.create,
  importClinicDiagnoses: settings.importCsv,
  setClinicDiagnosisActive: settings.setActive,
}));
vi.mock('@/app/(staff)/pacientes/[id]/actions/plano-cuidados', () => ({
  addCarePlanDiagnosis: plan.add,
  evaluateCarePlanOutcome: vi.fn(),
  openCarePlan: vi.fn(),
  prescribeCarePlanIntervention: vi.fn(),
  prescribeCarePlanOutcome: vi.fn(),
  recordCarePlanIntervention: vi.fn(),
  resolveCarePlan: vi.fn(),
}));
vi.mock('@/lib/use-api-query', () => ({
  useApiQuery: (url: string | null) => ({
    data: url ? queries.data[url.split('?')[0] as string] : undefined,
    error: null,
    refetch: vi.fn(),
  }),
}));

const ok = (data: unknown) => Promise.resolve({ success: true, data });
const fail = (error: string) => Promise.resolve({ success: false, error });

const item = (
  over: Partial<ClinicNursingDiagnosisDto> = {},
): ClinicNursingDiagnosisDto => ({
  id: 'c1',
  code: null,
  label: 'Pele periestomal irritada',
  domain: 'Segurança',
  class: null,
  edition: 'NANDA-I 2024-2026',
  definition: null,
  active: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  queries.data = {};
});
afterEach(cleanup);

describe('Feature: Configurações › Diagnósticos de enfermagem (#954)', () => {
  it('Dado catálogo vazio, Quando abrir, Então explica que a busca usa só o catálogo padrão', () => {
    renderWithToast(<ClinicDiagnosesSection diagnoses={[]} />);
    expect(
      screen.getByText(/Nenhum diagnóstico cadastrado/),
    ).toBeInTheDocument();
    expect(screen.getByText('Catálogo da clínica (0)')).toBeInTheDocument();
  });

  it('Dado o formulário, Quando cadastrar, Então envia os campos e limpa; erro aparece na tela', async () => {
    settings.create
      .mockReturnValueOnce(ok(item()))
      .mockReturnValueOnce(fail('Já está no catálogo'));
    renderWithToast(<ClinicDiagnosesSection diagnoses={[]} />);
    const title = screen.getByLabelText('Título');
    fireEvent.change(title, { target: { value: 'Dor aguda' } });
    fireEvent.change(screen.getByLabelText('Código NANDA-I (opcional)'), {
      target: { value: '00132' },
    });
    fireEvent.change(screen.getByLabelText('Edição (opcional)'), {
      target: { value: 'NANDA-I 2024-2026' },
    });
    fireEvent.change(screen.getByLabelText('Domínio (opcional)'), {
      target: { value: 'Conforto' },
    });
    fireEvent.change(screen.getByLabelText('Classe (opcional)'), {
      target: { value: 'Físico' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Cadastrar diagnóstico' }),
    );

    await waitFor(() => expect(title).toHaveValue(''));
    expect(settings.create).toHaveBeenCalledWith({
      code: '00132',
      label: 'Dor aguda',
      domain: 'Conforto',
      class: 'Físico',
      edition: 'NANDA-I 2024-2026',
    });

    fireEvent.change(title, { target: { value: 'Dor aguda' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Cadastrar diagnóstico' }),
    );
    expect(await screen.findByText('Já está no catálogo')).toBeInTheDocument();
  });

  it('Dado uma planilha, Quando importar, Então mostra o resumo e as linhas com problema em ordem', async () => {
    settings.importCsv.mockReturnValueOnce(
      ok({
        created: 2,
        duplicates: [{ line: 5, message: '"Dor" já está no catálogo' }],
        errors: [{ line: 3, message: 'Código NANDA-I deve ter 5 dígitos' }],
      }),
    );
    renderWithToast(<ClinicDiagnosesSection diagnoses={[]} />);
    const file = new File(['titulo\nDor'], 'lista.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('Planilha de diagnósticos (CSV)'), {
      target: { files: [file] },
    });

    expect(
      await screen.findByText(
        /2 diagnóstico\(s\) importado\(s\)\. 1 já estava\(m\) no catálogo\. 1 linha\(s\) com problema\./,
      ),
    ).toBeInTheDocument();
    const lines = screen
      .getAllByText(/^Linha \d/)
      .map((node) => node.textContent);
    expect(lines).toEqual([
      'Linha 3: Código NANDA-I deve ter 5 dígitos',
      'Linha 5: "Dor" já está no catálogo',
    ]);
    expect(settings.importCsv).toHaveBeenCalledWith({ csv: 'titulo\nDor' });
  });

  it('Dado importação sem problemas, falha ou arquivo grande, Quando importar, Então mostra só o necessário', async () => {
    settings.importCsv
      .mockReturnValueOnce(ok({ created: 1, duplicates: [], errors: [] }))
      .mockReturnValueOnce(fail('O arquivo precisa de uma coluna "titulo"'));
    renderWithToast(<ClinicDiagnosesSection diagnoses={[]} />);
    const input = screen.getByLabelText('Planilha de diagnósticos (CSV)');

    fireEvent.change(input, {
      target: { files: [new File(['titulo\nDor'], 'a.csv')] },
    });
    expect(
      await screen.findByText('1 diagnóstico(s) importado(s).'),
    ).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [new File(['x'], 'b.csv')] } });
    expect(
      await screen.findByText('O arquivo precisa de uma coluna "titulo"'),
    ).toBeInTheDocument();

    const big = new File(['x'], 'c.csv');
    Object.defineProperty(big, 'size', { value: 2_000_000 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/passa de 1 MB/)).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [] } });
    expect(settings.importCsv).toHaveBeenCalledTimes(2);
  });

  it('Dado itens ativos e inativos, Quando alternar, Então chama a ação com o estado oposto e avisa a falha', async () => {
    settings.setActive
      .mockReturnValueOnce(ok(item({ active: false })))
      .mockReturnValueOnce(fail('Sem acesso'));
    renderWithToast(
      <ClinicDiagnosesSection
        diagnoses={[
          item(),
          item({
            id: 'c2',
            code: '00046',
            label: 'Integridade',
            active: false,
            domain: null,
            edition: null,
          }),
        ]}
      />,
    );
    expect(screen.getByText('Sem código')).toBeInTheDocument();
    expect(
      screen.getByText('Segurança · NANDA-I 2024-2026'),
    ).toBeInTheDocument();
    expect(screen.getByText(/\(desativado\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));
    await waitFor(() =>
      expect(settings.setActive).toHaveBeenCalledWith({
        id: 'c1',
        active: false,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    expect(await screen.findByText('Sem acesso')).toBeInTheDocument();
  });
});

describe('Feature: plano de cuidados com o catálogo da clínica e diagnóstico digitado (#954)', () => {
  const render = () => {
    const onSaved = vi.fn();
    renderWithToast(<AddDiagnosisForm carePlanId="plan-1" onSaved={onSaved} />);
    return onSaved;
  };

  it('Dado busca, Quando há item da clínica com o código de um global, Então mostra o da clínica primeiro e esconde o global repetido', async () => {
    queries.data['/api/taxonomy/clinic-diagnoses'] = [
      item({ id: 'c1', code: '00046', label: 'Integridade (clínica)' }),
      item({ id: 'c2' }),
    ];
    queries.data['/api/taxonomy/diagnoses'] = [
      { code: '00046', label: 'Integridade global' },
      { code: '00004', label: 'Risco de infecção' },
    ];
    plan.add.mockReturnValue(ok({}));
    const onSaved = render();
    fireEvent.change(screen.getByLabelText('Buscar diagnóstico (NANDA-I)'), {
      target: { value: 'pe' },
    });

    const options = screen.getAllByRole('button').map((b) => b.textContent);
    expect(options.slice(0, 3)).toEqual([
      '00046 — Integridade (clínica)da clínica',
      'Pele periestomal irritadada clínica',
      '00004 — Risco de infecção',
    ]);
    expect(screen.queryByText('Integridade global')).toBeNull();

    fireEvent.click(screen.getByText('Pele periestomal irritada'));
    expect(screen.getByLabelText('Buscar diagnóstico (NANDA-I)')).toHaveValue(
      'Pele periestomal irritada',
    );
    fireEvent.change(screen.getByLabelText('Relacionado a (etiologia)'), {
      target: { value: 'Efluente' },
    });
    fireEvent.change(
      screen.getByLabelText('Evidenciado por (características definidoras)'),
      {
        target: { value: 'Eritema' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Prescrever diagnóstico' }),
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(plan.add).toHaveBeenCalledWith({
      id: 'plan-1',
      body: {
        clinicDiagnosisId: 'c2',
        type: 'real',
        relatedFactors: 'Efluente',
        definingCharacteristics: 'Eritema',
      },
    });
  });

  it('Dado item global, Quando selecionar, Então envia o código e mostra código e título no campo', async () => {
    queries.data['/api/taxonomy/diagnoses'] = [
      { code: '00004', label: 'Risco de infecção' },
    ];
    plan.add.mockReturnValue(ok({}));
    render();
    fireEvent.change(screen.getByLabelText('Buscar diagnóstico (NANDA-I)'), {
      target: { value: 'ri' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Risco de infecção/ }));
    expect(screen.getByLabelText('Buscar diagnóstico (NANDA-I)')).toHaveValue(
      '00004 — Risco de infecção',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Risco' }));
    expect(
      screen.queryByLabelText('Evidenciado por (características definidoras)'),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText('Relacionado a (etiologia)'), {
      target: { value: 'Lesão aberta' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Prescrever diagnóstico' }),
    );
    await waitFor(() =>
      expect(plan.add).toHaveBeenCalledWith({
        id: 'plan-1',
        body: {
          diagnosisCode: '00004',
          type: 'risco',
          relatedFactors: 'Lesão aberta',
          definingCharacteristics: null,
        },
      }),
    );
  });

  it('Dado "Não achei", Quando escrever uma síndrome, Então envia o título sem código e a etiologia é opcional', async () => {
    plan.add.mockReturnValueOnce(fail('Plano de cuidados não está ativo'));
    render();
    fireEvent.change(screen.getByLabelText('Buscar diagnóstico (NANDA-I)'), {
      target: { value: 'Síndrome do' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Não achei: escrever o diagnóstico' }),
    );

    const typed = screen.getByLabelText('Diagnóstico (sem código)');
    expect(typed).toHaveValue('Síndrome do');
    fireEvent.change(typed, {
      target: { value: '  Síndrome do idoso frágil ' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Síndrome' }));
    expect(
      screen.getByLabelText('Relacionado a (etiologia, opcional)'),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText('Evidenciado por (características definidoras)'),
      {
        target: { value: 'Fadiga; mobilidade prejudicada' },
      },
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Promoção da saúde' }));
    expect(screen.queryByLabelText(/Relacionado a/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Síndrome' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Prescrever diagnóstico' }),
    );

    expect(
      await screen.findByText('Plano de cuidados não está ativo'),
    ).toBeInTheDocument();
    expect(plan.add).toHaveBeenCalledWith({
      id: 'plan-1',
      body: {
        diagnosisLabel: 'Síndrome do idoso frágil',
        type: 'sindrome',
        relatedFactors: null,
        definingCharacteristics: 'Fadiga; mobilidade prejudicada',
      },
    });
  });

  it('Dado nada escolhido, Quando prescrever, Então pede para selecionar', () => {
    render();
    fireEvent.click(
      screen.getByRole('button', { name: 'Prescrever diagnóstico' }),
    );
    expect(
      screen.getByText('Selecione um diagnóstico do catálogo'),
    ).toBeInTheDocument();
    expect(plan.add).not.toHaveBeenCalled();
  });
});
