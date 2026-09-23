// @vitest-environment jsdom

import { act, cleanup, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import AttendanceDocumentPage from '@/app/documentos/atestado/[appointmentId]/page';
import ConsentDocumentPage from '@/app/documentos/consentimento/[patientId]/page';
import CarePlanDocumentPage from '@/app/documentos/plano-cuidados/[carePlanId]/page';
import PartnerReportPage from '@/app/documentos/relatorio/[conditionId]/page';
import type {
  AppointmentDto,
  AssessmentDto,
  CarePlanDetailDto,
  ClinicInfoDto,
  ConditionDto,
  PatientDto,
} from '@/lib/dto';

interface FetchCall {
  url: string;
}

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: async () => ({
    success: ok,
    data,
    error: ok ? null : 'não encontrado',
  }),
});

type MockedResponse = { ok: boolean; json: () => Promise<unknown> };

const mockFetch = (
  router: (call: FetchCall) => MockedResponse | Promise<never>,
) => {
  const fn = vi.fn(async (url: string) => router({ url }));
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderPage(ui: ReactElement) {
  await act(async () => {
    renderWithToast(ui);
  });
}

const CLINIC_INCOMPLETE: ClinicInfoDto = {
  name: 'Clínica VittaFlow',
  cnpj: null,
  address: null,
  city: null,
  professionalName: null,
  professionalRegistry: null,
};

const CLINIC_COMPLETE: ClinicInfoDto = {
  name: 'Clínica VittaFlow',
  cnpj: '12.345.678/0001-90',
  address: 'Rua das Flores, 100',
  city: 'São Paulo',
  professionalName: 'Enf. Ana',
  professionalRegistry: 'COREN-SP 123456',
};

const appointment = (status: string): AppointmentDto => ({
  id: 'apt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: '2026-09-01T13:00:00.000Z',
  endsAt: '2026-09-01T13:30:00.000Z',
  procedure: 'Troca de bolsa',
  priceCents: 10000,
  notes: null,
  status,
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
});

const condition: ConditionDto = {
  id: 'cond-1',
  patientId: 'pat-1',
  kind: 'wound',
  title: 'Ferida sacral',
  stomaType: null,
  startedAt: null,
  notes: null,
  status: 'active',
  createdAt: '2026-08-01T00:00:00.000Z',
};

const carePlanDetail: CarePlanDetailDto = {
  plan: {
    id: 'plan-1',
    patientId: 'pat-1',
    conditionId: null,
    professionalId: null,
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  diagnoses: [],
  outcomes: [],
  interventions: [],
};

const carePlanDetailWithDiagnosis: CarePlanDetailDto = {
  ...carePlanDetail,
  diagnoses: [
    {
      id: 'diag-1',
      carePlanId: 'plan-1',
      diagnosisCode: '00046',
      diagnosisLabel: 'Integridade da pele prejudicada',
      type: 'real',
      relatedFactors: 'pressão prolongada',
      definingCharacteristics: 'lesão em região sacral',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  outcomes: [
    {
      id: 'outcome-1',
      carePlanId: 'plan-1',
      outcomeCode: '1101',
      outcomeLabel: 'Integridade tissular',
      scaleAnchors: [
        'Gravemente comprometida',
        'Substancialmente comprometida',
        'Moderadamente comprometida',
        'Levemente comprometida',
        'Não comprometida',
      ],
      baselineScore: 2,
      targetScore: 4,
      deadline: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      currentScore: 3,
      attainment: 50,
      isAchieved: false,
      evaluations: [],
    },
  ],
};

const assessment: AssessmentDto = {
  id: 'assess-1',
  conditionId: 'cond-1',
  lengthMm: 20,
  widthMm: 10,
  depthMm: null,
  areaMm2: 200,
  tissueType: 'granulação',
  exudate: 'moderate',
  painScale: 3,
  skinCondition: 'íntegra',
  complications: null,
  complicationCodes: [],
  detScore: null,
  pushScore: 8,
  notes: null,
  createdAt: '2026-08-15T00:00:00.000Z',
};

const issuance = () =>
  jsonResponse({
    documentNumber: 'TEST-00000001',
    issuedAt: '2026-09-01T10:00:00.000Z',
  });

const patient: PatientDto = {
  id: 'pat-1',
  fullName: 'Maria Souza',
  email: 'maria@example.com',
  phone: '11999999999',
  birthDate: null,
  notes: null,
  active: true,
  referredByPartnerId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('Feature: bloqueio fail-closed de documentos sem dados cadastrais (#62)', () => {
  it('Dado clínica incompleta, Quando abrir o atestado, Então bloqueia com mensagem, não a declaração', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_INCOMPLETE);
      return jsonResponse(appointment('completed'));
    });

    await renderPage(
      <AttendanceDocumentPage
        params={Promise.resolve({ appointmentId: 'apt-1' })}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/sem CNPJ ou responsável técnico/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'Declaração de Comparecimento' }),
    ).not.toBeInTheDocument();
  });

  it('Dado clínica completa e consulta concluída, Quando abrir o atestado, Então renderiza a declaração', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      if (url.includes('/api/patients/')) return jsonResponse(patient);
      return jsonResponse(appointment('completed'));
    });

    await renderPage(
      <AttendanceDocumentPage
        params={Promise.resolve({ appointmentId: 'apt-1' })}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Declaração de Comparecimento' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(`CNPJ: ${CLINIC_COMPLETE.cnpj}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(CLINIC_COMPLETE.professionalName as string),
    ).toBeInTheDocument();
  });

  it("Dado consulta ainda carregando, Quando abrir o atestado, Então exibe carregamento, não 'consulta não encontrada' (#63)", async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      return new Promise<never>(() => {});
    });

    await renderPage(
      <AttendanceDocumentPage
        params={Promise.resolve({ appointmentId: 'apt-1' })}
      />,
    );

    expect(await screen.findByText('Carregando…')).toBeInTheDocument();
    expect(
      screen.queryByText('Consulta não encontrada'),
    ).not.toBeInTheDocument();
  });

  it('Dado consulta cancelada, Quando abrir o atestado, Então bloqueia com o status atual', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      return jsonResponse(appointment('cancelled'));
    });

    await renderPage(
      <AttendanceDocumentPage
        params={Promise.resolve({ appointmentId: 'apt-1' })}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/"cancelled"/)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'Declaração de Comparecimento' }),
    ).not.toBeInTheDocument();
  });

  it('Dado consulta com falta registrada, Quando abrir o atestado, Então bloqueia', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      return jsonResponse(appointment('no_show'));
    });

    await renderPage(
      <AttendanceDocumentPage
        params={Promise.resolve({ appointmentId: 'apt-1' })}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/"no_show"/)).toBeInTheDocument(),
    );
  });

  it('Dado clínica incompleta, Quando abrir o relatório, Então bloqueia', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_INCOMPLETE);
      if (url.includes('/assessments')) return jsonResponse([assessment]);
      return jsonResponse(condition);
    });

    await renderPage(
      <PartnerReportPage params={Promise.resolve({ conditionId: 'cond-1' })} />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/sem CNPJ ou responsável técnico/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'Relatório de Evolução Clínica' }),
    ).not.toBeInTheDocument();
  });

  it('Dado clínica completa, Quando abrir o relatório, Então renderiza normalmente', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      if (url.includes('/assessments')) return jsonResponse([assessment]);
      if (url.includes('/api/patients/')) return jsonResponse(patient);
      return jsonResponse(condition);
    });

    await renderPage(
      <PartnerReportPage params={Promise.resolve({ conditionId: 'cond-1' })} />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Relatório de Evolução Clínica' }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(`CNPJ: ${CLINIC_COMPLETE.cnpj}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(CLINIC_COMPLETE.professionalName as string),
    ).toBeInTheDocument();
  });

  it('Dado clínica incompleta, Quando abrir o plano de cuidados, Então bloqueia', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_INCOMPLETE);
      return jsonResponse(carePlanDetailWithDiagnosis);
    });

    await renderPage(
      <CarePlanDocumentPage
        params={Promise.resolve({ carePlanId: 'plan-1' })}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/sem CNPJ ou responsável técnico/i),
      ).toBeInTheDocument(),
    );
  });

  it('Dado clínica completa, Quando abrir o plano de cuidados, Então renderiza normalmente', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      if (url.includes('/api/patients/')) return jsonResponse(patient);
      return jsonResponse(carePlanDetailWithDiagnosis);
    });

    await renderPage(
      <CarePlanDocumentPage
        params={Promise.resolve({ carePlanId: 'plan-1' })}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'Plano de Cuidados de Enfermagem (SAE)',
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(`CNPJ: ${CLINIC_COMPLETE.cnpj}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(CLINIC_COMPLETE.professionalName as string),
    ).toBeInTheDocument();
  });

  // #94, DOC-02: consentimento era o único dos 4 documentos sem a guarda de
  // clínica completa — corrigido, então agora bloqueia igual aos outros 3.
  it('Dado clínica incompleta, Quando abrir o consentimento, Então bloqueia', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_INCOMPLETE);
      return jsonResponse(patient);
    });

    await renderPage(
      <ConsentDocumentPage params={Promise.resolve({ patientId: 'pat-1' })} />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/sem CNPJ ou responsável técnico/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', {
        name: 'Termo de Consentimento Livre e Esclarecido',
      }),
    ).not.toBeInTheDocument();
  });

  it('Dado clínica completa, Quando abrir o consentimento, Então renderiza normalmente', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      return jsonResponse(patient);
    });

    await renderPage(
      <ConsentDocumentPage params={Promise.resolve({ patientId: 'pat-1' })} />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'Termo de Consentimento Livre e Esclarecido',
        }),
      ).toBeInTheDocument(),
    );
  });

  it('Dado plano sem diagnóstico, resultado ou intervenção, Quando abrir, Então bloqueia (DOC-04)', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      if (url.includes('/api/patients/')) return jsonResponse(patient);
      return jsonResponse(carePlanDetail);
    });

    await renderPage(
      <CarePlanDocumentPage
        params={Promise.resolve({ carePlanId: 'plan-1' })}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/documento vazio/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', {
        name: 'Plano de Cuidados de Enfermagem (SAE)',
      }),
    ).not.toBeInTheDocument();
  });

  it('Dado condição sem nenhuma avaliação registrada, Quando abrir o relatório, Então bloqueia (DOC-05)', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      if (url.includes('/assessments')) return jsonResponse([]);
      return jsonResponse(condition);
    });

    await renderPage(
      <PartnerReportPage params={Promise.resolve({ conditionId: 'cond-1' })} />,
    );

    await waitFor(() =>
      expect(screen.getByText(/relatório vazio/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('heading', { name: 'Relatório de Evolução Clínica' }),
    ).not.toBeInTheDocument();
  });
});

describe('Feature: conteúdo dos documentos (#94)', () => {
  it('Dado atestado emitido, Quando renderizar, Então mostra número e nota de documento eletrônico (DOC-01)', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      if (url.includes('/api/patients/')) return jsonResponse(patient);
      return jsonResponse(appointment('completed'));
    });

    await renderPage(
      <AttendanceDocumentPage
        params={Promise.resolve({ appointmentId: 'apt-1' })}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Declaração de Comparecimento' }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Documento nº TEST-00000001/)).toBeInTheDocument();
    expect(screen.getByText(/gerado eletronicamente/)).toBeInTheDocument();
  });

  it('Dado consentimento renderizado, Então a data vem antes das duas assinaturas (DOC-03)', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      return jsonResponse(patient);
    });

    let renderResult!: ReturnType<typeof renderWithToast>;
    await act(async () => {
      renderResult = renderWithToast(
        <ConsentDocumentPage
          params={Promise.resolve({ patientId: 'pat-1' })}
        />,
      );
    });
    const { container } = renderResult;

    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'Termo de Consentimento Livre e Esclarecido',
        }),
      ).toBeInTheDocument(),
    );

    const text = container.textContent ?? '';
    const dateIndex = text.indexOf('São Paulo,');
    const patientSignatureIndex = text.indexOf('Paciente ou responsável legal');
    const professionalSignatureIndex = text.lastIndexOf(
      CLINIC_COMPLETE.professionalName as string,
    );
    expect(dateIndex).toBeGreaterThanOrEqual(0);
    expect(dateIndex).toBeLessThan(patientSignatureIndex);
    expect(patientSignatureIndex).toBeLessThan(professionalSignatureIndex);
  });

  it('Dado consentimento renderizado, Então tem linha de responsável legal, autorização de imagem separada, versão e duas vias (DOC-08/09/10)', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      return jsonResponse(patient);
    });

    await renderPage(
      <ConsentDocumentPage params={Promise.resolve({ patientId: 'pat-1' })} />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'Termo de Consentimento Livre e Esclarecido',
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Nome e CPF do responsável legal/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Autorização de uso de imagem'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/independente do consentimento acima/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Versão do termo:/)).toBeInTheDocument();
    expect(screen.getByText(/duas vias/)).toBeInTheDocument();
  });

  it('Dado plano de cuidados com profissional responsável, Então a assinatura usa o nome dele, não o genérico da clínica (DOC-11)', async () => {
    const planWithProfessional: CarePlanDetailDto = {
      ...carePlanDetailWithDiagnosis,
      plan: { ...carePlanDetailWithDiagnosis.plan, professionalId: 'prof-1' },
    };
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      if (url.includes('/api/patients/')) return jsonResponse(patient);
      if (url.includes('/api/professionals/')) {
        return jsonResponse({
          id: 'prof-1',
          fullName: 'Enf. Beatriz',
          registry: 'COREN-SP 999999',
          commissionPct: null,
          active: true,
        });
      }
      return jsonResponse(planWithProfessional);
    });

    await renderPage(
      <CarePlanDocumentPage
        params={Promise.resolve({ carePlanId: 'plan-1' })}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Enf. Beatriz')).toBeInTheDocument(),
    );
    expect(screen.getByText('COREN-SP 999999')).toBeInTheDocument();
    expect(
      screen.queryByText(CLINIC_COMPLETE.professionalName as string),
    ).not.toBeInTheDocument();
  });

  it('Dado tabela NOC do plano de cuidados, Então os cabeçalhos indicam a escala 1-5 (DOC-12)', async () => {
    mockFetch(({ url }) => {
      if (url.includes('/api/documents/issue')) return issuance();
      if (url.includes('/api/clinic-info'))
        return jsonResponse(CLINIC_COMPLETE);
      if (url.includes('/api/patients/')) return jsonResponse(patient);
      return jsonResponse(carePlanDetailWithDiagnosis);
    });

    await renderPage(
      <CarePlanDocumentPage
        params={Promise.resolve({ carePlanId: 'plan-1' })}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'Plano de Cuidados de Enfermagem (SAE)',
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('Basal (escala 1-5)')).toBeInTheDocument();
  });
});
