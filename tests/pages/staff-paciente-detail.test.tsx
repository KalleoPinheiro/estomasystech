// @vitest-environment jsdom

import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import type { PackageDto } from '@/app/(staff)/pacientes/[id]/packages-section';
import PatientRecordPage from '@/app/(staff)/pacientes/[id]/page';
import type { UserRole } from '@/domain/auth/user-role';
import type {
  AnamnesisDto,
  AssessmentDto,
  ConditionDto,
  ConditionPhotoDto,
  EvolutionNoteDto,
  PatientDto,
  ProfessionalDto,
  ProfessionalOptionDto,
} from '@/lib/dto';
import { formatDate, formatDateTime } from '@/lib/format';
import { WithStaffIdentity } from '../support/staff-identity';

const { routerMock, searchParamsRef } = vi.hoisted(() => {
  return {
    routerMock: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
    searchParamsRef: { current: new URLSearchParams() },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => searchParamsRef.current,
}));

interface FetchCall {
  url: string;
  init?: RequestInit;
}
type MockedResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};

const jsonResponse = (data: unknown, ok = true): MockedResponse => ({
  ok,
  json: async () => ({ success: ok, data, error: ok ? null : 'Erro' }),
});

const errorResponse = (message: string): MockedResponse => ({
  ok: false,
  json: async () => ({ success: false, data: null, error: message }),
});

/** Resposta crua usada pelo upload de foto (fetch direto, sem envelope da API). */
const rawResponse = (ok: boolean, body: unknown): MockedResponse => ({
  ok,
  json: async () => body,
});

const mockFetch = (
  router: (call: FetchCall) => MockedResponse | Promise<MockedResponse>,
): ReturnType<typeof vi.fn> => {
  const fn = vi.fn(async (url: string, init?: RequestInit) =>
    router({ url, init }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
  searchParamsRef.current = new URLSearchParams();
  routerMock.replace.mockClear();
});

async function renderDetail(id = 'pac-1') {
  await act(async () => {
    // Mesmo provider do layout da equipe (#199): as abas seguem o papel.
    renderWithToast(
      <WithStaffIdentity>
        <PatientRecordPage params={Promise.resolve({ id })} />
      </WithStaffIdentity>,
    );
  });
}

const patientFixture: PatientDto = {
  id: 'pac-1',
  fullName: 'Maria Souza',
  email: 'maria@example.com',
  phone: '11988887777',
  birthDate: '1990-05-10T00:00:00.000Z',
  notes: null,
  referredByPartnerId: null,
  active: true,
  anonymized: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const anamnesisFixture: AnamnesisDto = {
  patientId: 'pac-1',
  comorbidities: 'Diabetes tipo 2',
  allergies: 'Látex',
  medications: 'Metformina 850mg',
  surgicalHistory: 'Colectomia (2024)',
  notes: 'Paciente colaborativo',
  updatedAt: '2026-01-05T10:00:00.000Z',
};

const woundConditionFixture: ConditionDto = {
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

const stomaConditionFixture: ConditionDto = {
  id: 'cond-stoma',
  patientId: 'pac-1',
  kind: 'stoma',
  title: 'Colostomia terminal QIE',
  stomaType: 'colostomia',
  startedAt: '2026-01-01T00:00:00.000Z',
  notes: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const resolvedConditionFixture: ConditionDto = {
  ...woundConditionFixture,
  id: 'cond-resolved',
  title: 'Ferida cicatrizada',
  status: 'resolved',
};

const pushAssessmentFixture: AssessmentDto = {
  id: 'assess-push',
  conditionId: 'cond-wound',
  lengthMm: 10,
  widthMm: 5,
  depthMm: 2,
  areaMm2: 50,
  tissueType: 'granulation',
  exudate: 'low',
  painScale: 3,
  skinCondition: null,
  complications: null,
  complicationCodes: [],
  detScore: null,
  pushScore: 7,
  notes: null,
  createdAt: '2026-01-02T09:00:00.000Z',
};

const detAssessmentFixture: AssessmentDto = {
  id: 'assess-det',
  conditionId: 'cond-stoma',
  lengthMm: null,
  widthMm: null,
  depthMm: null,
  areaMm2: null,
  tissueType: null,
  exudate: null,
  painScale: null,
  skinCondition: 'Íntegra',
  complications: null,
  complicationCodes: [],
  detScore: 5,
  pushScore: null,
  notes: null,
  createdAt: '2026-01-02T09:00:00.000Z',
};

const complicationsAssessmentFixture: AssessmentDto = {
  ...detAssessmentFixture,
  id: 'assess-complications',
  complications: 'Observação livre adicional',
  complicationCodes: ['dermatitis', 'bleeding'],
};

const evolutionFixture: EvolutionNoteDto = {
  id: 'evo-1',
  patientId: 'pac-1',
  appointmentId: null,
  professionalId: 'prof-1',
  subjective: 'Dor leve na região',
  objective: 'Ferida limpa, sem sinais de infecção',
  assessment: 'Evoluindo bem',
  plan: 'Manter curativo atual',
  createdAt: '2026-01-02T09:00:00.000Z',
};

const professionalFixture: ProfessionalDto = {
  id: 'prof-1',
  fullName: 'Dra. Ana',
  registry: null,
  commissionType: 'percentage',
  commissionPct: null,
  commissionFixedCents: null,
  active: true,
};

const photoFixture: ConditionPhotoDto = {
  id: 'photo-1',
  conditionId: 'cond-wound',
  assessmentId: null,
  contentType: 'image/png',
  sizeBytes: 1000,
  origin: 'staff',
  patientNote: null,
  triageStatus: null,
  createdAt: '2026-01-01T08:00:00.000Z',
};

const laterPhotoFixture: ConditionPhotoDto = {
  ...photoFixture,
  id: 'photo-2',
  createdAt: '2026-01-10T08:00:00.000Z',
};

interface RouterOptions {
  patient?: PatientDto | null;
  patientError?: string;
  anamnesis?: AnamnesisDto | null;
  anamnesisError?: string;
  conditions?: ConditionDto[];
  conditionsError?: string;
  evolutions?: EvolutionNoteDto[];
  evolutionsError?: string;
  professionals?: ProfessionalOptionDto[];
  assessmentsByCondition?: Record<string, AssessmentDto[]>;
  photosByCondition?: Record<string, ConditionPhotoDto[]>;
  packages?: PackageDto[];
  /** Papel devolvido por `/api/auth/identity` — decide a aba Pacotes (#189). */
  role?: string;
  patientStatus?: number;
  extra?: (
    call: FetchCall,
  ) => MockedResponse | Promise<MockedResponse> | undefined;
}

/** Rotas GET aninhadas por conditionId (assessments/photos) — casadas via regex. */
function matchNestedConditionRoute(
  url: string,
  method: string,
  assessmentsByCondition: Record<string, AssessmentDto[]>,
  photosByCondition: Record<string, ConditionPhotoDto[]>,
): MockedResponse | undefined {
  if (method !== 'GET') return undefined;
  const assessMatch = /^\/api\/conditions\/([^/]+)\/assessments$/.exec(url);
  if (assessMatch)
    return jsonResponse(assessmentsByCondition[assessMatch[1]] ?? []);
  const photosMatch = /^\/api\/conditions\/([^/]+)\/photos$/.exec(url);
  if (photosMatch) return jsonResponse(photosByCondition[photosMatch[1]] ?? []);
  return undefined;
}

function buildRouter({
  patient = patientFixture,
  patientError,
  anamnesis = null,
  anamnesisError,
  conditions = [],
  conditionsError,
  evolutions = [],
  evolutionsError,
  professionals = [],
  assessmentsByCondition = {},
  photosByCondition = {},
  packages = [] as PackageDto[],
  role = 'company_admin',
  patientStatus,
  extra,
}: RouterOptions = {}) {
  const exactRoutes: Record<string, () => MockedResponse> = {
    '/api/patients/pac-1': () =>
      patientError
        ? { ...errorResponse(patientError), status: patientStatus }
        : jsonResponse(patient),
    '/api/patients/pac-1/anamnesis': () =>
      anamnesisError ? errorResponse(anamnesisError) : jsonResponse(anamnesis),
    '/api/patients/pac-1/conditions': () =>
      conditionsError
        ? errorResponse(conditionsError)
        : jsonResponse(conditions),
    '/api/patients/pac-1/evolutions': () =>
      evolutionsError
        ? errorResponse(evolutionsError)
        : jsonResponse(evolutions),
    '/api/options/professionals': () => jsonResponse(professionals),
    '/api/auth/identity': () =>
      jsonResponse({
        clinicLabel: 'Clínica',
        account: { email: 'x@y.com', role, roleLabel: role },
      }),
    '/api/packages?patientId=pac-1': () => jsonResponse(packages),
    '/api/patients/pac-1/packages': () => jsonResponse(packages),
  };

  return ({
    url,
    init,
  }: FetchCall): MockedResponse | Promise<MockedResponse> => {
    const method = init?.method ?? 'GET';

    const custom = extra?.({ url, init });
    if (custom) return custom;

    const exact = exactRoutes[url];
    if (exact) return exact();

    const nested = matchNestedConditionRoute(
      url,
      method,
      assessmentsByCondition,
      photosByCondition,
    );
    if (nested) return nested;

    return errorResponse(`URL não mapeada no mock: ${method} ${url}`);
  };
}

describe('Feature: PatientRecordPage', () => {
  describe('Cenário: carregamento e erro', () => {
    it('Dado que o paciente ainda não carregou, Quando renderizar, Então exibe indicador de carregamento', async () => {
      mockFetch(({ url }) => {
        if (url === '/api/patients/pac-1') return new Promise<never>(() => {});
        return jsonResponse([]);
      });

      await renderDetail();

      expect(screen.getByText('Carregando…')).toBeInTheDocument();
    });

    it('Dado falha ao carregar paciente, Quando renderizar, Então exibe alerta de erro', async () => {
      mockFetch(buildRouter({ patientError: 'Paciente não encontrado' }));

      await renderDetail();

      expect(
        await screen.findByText('Paciente não encontrado'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: cabeçalho, alergias e abas', () => {
    it('Dado paciente com alergias, Quando renderizar, Então exibe cabeçalho e banner de alergia', async () => {
      mockFetch(buildRouter({ anamnesis: anamnesisFixture }));

      await renderDetail();

      expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
      const allergyAlert = screen.getByRole('alert');
      expect(allergyAlert).toHaveTextContent('Alergias:');
      expect(allergyAlert).toHaveTextContent('Látex');
    });

    it('Dado condições e evoluções cadastradas, Quando renderizar, Então mostra contagem nas abas e alterna entre elas', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          evolutions: [evolutionFixture],
        }),
      );

      await renderDetail();
      await screen.findByText('Maria Souza');

      expect(screen.getByText('Estomias e feridas (1)')).toBeInTheDocument();
      expect(screen.getByText('Evoluções (SOAP) (1)')).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByText('Estomias e feridas (1)'));
      expect(
        await screen.findByText('Úlcera venosa perna E'),
      ).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByText('Evoluções (SOAP) (1)'));
      expect(await screen.findByText(/Dor leve na região/)).toBeInTheDocument();
    });

    it('Dado paciente inativo e sem data de nascimento, Quando renderizar cabeçalho, Então exibe badge Inativo sem texto de nascimento', async () => {
      mockFetch(
        buildRouter({
          patient: { ...patientFixture, active: false, birthDate: null },
        }),
      );

      await renderDetail();
      await screen.findByText('Maria Souza');

      expect(screen.getByText('Inativo')).toBeInTheDocument();
      expect(screen.queryByText(/nasc\./)).not.toBeInTheDocument();
    });

    it('Dado condições e evoluções ainda carregando, Quando exibir abas e trocar, Então cada aba mostra indicador de carregamento (não vazio)', async () => {
      mockFetch(
        buildRouter({
          extra: ({ url }) => {
            if (
              url === '/api/patients/pac-1/conditions' ||
              url === '/api/patients/pac-1/evolutions'
            ) {
              return new Promise<never>(() => {});
            }
            return undefined;
          },
        }),
      );

      await renderDetail();
      await screen.findByText('Maria Souza');

      expect(screen.getByText('Estomias e feridas')).toBeInTheDocument();
      expect(screen.getByText('Evoluções (SOAP)')).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByText('Estomias e feridas'));
      expect(await screen.findAllByText('Carregando…')).not.toHaveLength(0);
      expect(
        screen.queryByText('Nenhuma condição clínica cadastrada.'),
      ).not.toBeInTheDocument();

      fireEvent.mouseDown(screen.getByText('Evoluções (SOAP)'));
      expect(await screen.findByText('Carregando…')).toBeInTheDocument();
      expect(
        screen.queryByText('Nenhuma evolução registrada.'),
      ).not.toBeInTheDocument();
    });

    it('Dado ?aba=evolucoes na URL, Quando montar a página, Então abre direto na aba de evoluções (PRONT-04)', async () => {
      searchParamsRef.current = new URLSearchParams('aba=evolucoes');
      mockFetch(buildRouter({ evolutions: [evolutionFixture] }));

      await renderDetail();

      expect(await screen.findByText(/Dor leve na região/)).toBeInTheDocument();
    });

    it('Dado ?aba= com valor inválido, Quando montar a página, Então cai no padrão Anamnese (PRONT-04)', async () => {
      searchParamsRef.current = new URLSearchParams('aba=nao-existe');
      mockFetch(buildRouter({ anamnesis: anamnesisFixture }));

      await renderDetail();

      expect(await screen.findByText('Comorbidades')).toBeInTheDocument();
    });

    it('Dado troca de aba, Quando acionada, Então atualiza a URL via router.replace (PRONT-04)', async () => {
      mockFetch(buildRouter({ conditions: [woundConditionFixture] }));

      await renderDetail();
      await screen.findByText('Maria Souza');
      fireEvent.mouseDown(screen.getByText(/Estomias e feridas/));

      await waitFor(() => {
        expect(routerMock.replace).toHaveBeenCalledWith(
          '/pacientes/pac-1?aba=condicoes',
          { scroll: false },
        );
      });
    });

    it("Dado a lista de abas, Quando renderizar, Então 'Pacotes' fica separada das clínicas (PRONT-09)", async () => {
      mockFetch(buildRouter());

      await renderDetail();
      await screen.findByText('Maria Souza');

      expect(screen.getByText('Pacotes')).toHaveClass('ml-auto');
    });
  });

  describe('Cenário: link de exportação LGPD por papel (#185)', () => {
    const identityRouter = (identity: MockedResponse) =>
      buildRouter({
        extra: ({ url }) =>
          url === '/api/auth/identity' ? identity : undefined,
      });

    const identityFor = (role: UserRole | null) =>
      jsonResponse({
        clinicLabel: 'Clínica Teste',
        account: role
          ? { email: `${role}@x.com`, role, roleLabel: role }
          : null,
      });

    it.each(['company_admin', 'profissional'] as const)(
      'Dado papel %s, Quando renderizar, Então mostra o link de exportação',
      async (role) => {
        mockFetch(identityRouter(identityFor(role)));

        await renderDetail();

        const link = await screen.findByRole('link', {
          name: 'Exportar dados (LGPD)',
        });
        expect(link).toHaveAttribute('href', '/api/patients/pac-1/export');
      },
    );

    it('Dado modo aberto (sem conta na sessão), Quando renderizar, Então mostra o link de exportação', async () => {
      mockFetch(identityRouter(identityFor(null)));

      await renderDetail();

      expect(
        await screen.findByRole('link', { name: 'Exportar dados (LGPD)' }),
      ).toBeInTheDocument();
    });

    // O super_admin nem chega à ficha (o proxy o leva a /plataforma, ADR-007);
    // se chegasse, a mesma matriz esconderia o link.
    it.each(['atendente', 'super_admin'] as const)(
      'Dado papel %s, Quando renderizar, Então NÃO mostra o link de exportação',
      async (role) => {
        const fetchMock = mockFetch(identityRouter(identityFor(role)));

        await renderDetail();

        expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
        await waitFor(() =>
          expect(
            fetchMock.mock.calls.some(([url]) => url === '/api/auth/identity'),
          ).toBe(true),
        );
        expect(
          screen.queryByRole('link', { name: 'Exportar dados (LGPD)' }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole('link', { name: 'Termo de consentimento' }),
        ).toBeInTheDocument();
      },
    );

    it('Dado falha ao carregar a identidade, Quando renderizar, Então NÃO mostra o link (fail-closed)', async () => {
      const fetchMock = mockFetch(
        identityRouter(errorResponse('Falha na identidade')),
      );

      await renderDetail();

      expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(([url]) => url === '/api/auth/identity'),
        ).toBe(true),
      );
      expect(
        screen.queryByRole('link', { name: 'Exportar dados (LGPD)' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Cenário: acesso do Profissional (#189)', () => {
    it('Dado profissional, Então a aba Pacotes aparece e mostra o saldo sem preço (#296)', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          role: 'profissional',
          packages: [
            {
              id: 'pk-1',
              procedureId: 'proc-1',
              procedureName: 'Curativo',
              totalSessions: 10,
              usedSessions: 4,
              remainingSessions: 6,
              expiresAt: null,
              active: true,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      );

      await renderDetail();
      await screen.findByText('Maria Souza');

      fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Pacotes' }));

      expect(await screen.findByText('Curativo')).toBeInTheDocument();
      expect(screen.getByText('6 de 10 sessões restantes')).toBeInTheDocument();
      expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls).toContain('/api/patients/pac-1/packages');
      expect(urls.some((url) => url.startsWith('/api/packages'))).toBe(false);
    });

    it('Dado admin, Então a aba Pacotes aparece', async () => {
      mockFetch(buildRouter({ role: 'company_admin' }));

      await renderDetail();

      expect(
        await screen.findByRole('tab', { name: 'Pacotes' }),
      ).toBeInTheDocument();
    });

    it('Dado 404 do paciente, Então a mensagem não expõe o id', async () => {
      mockFetch(
        buildRouter({
          patientError: 'Paciente não encontrado(a)',
          patientStatus: 404,
        }),
      );

      await renderDetail();

      expect(
        await screen.findByText('Paciente não encontrado.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/0b7a5c1e/)).not.toBeInTheDocument();
    });
  });

  describe('Cenário: anamnesis-section', () => {
    it('Dado anamnese existente, Quando renderizar, Então exibe os campos preenchidos', async () => {
      mockFetch(buildRouter({ anamnesis: anamnesisFixture }));

      await renderDetail();
      await screen.findByText('Maria Souza');

      expect(screen.getByDisplayValue('Diabetes tipo 2')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Metformina 850mg')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Colectomia (2024)')).toBeInTheDocument();
    });

    it('Dado edição de anamnese, Quando salvar com sucesso, Então envia PUT e confirma o salvamento', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          extra: ({ url, init }) => {
            if (
              url === '/api/patients/pac-1/anamnesis' &&
              init?.method === 'PUT'
            ) {
              return jsonResponse({
                ...anamnesisFixture,
                comorbidities: 'Hipertensão',
              });
            }
            return undefined;
          },
        }),
      );

      await renderDetail();
      await screen.findByText('Maria Souza');

      fireEvent.change(screen.getByLabelText('Comorbidades'), {
        target: { value: 'Hipertensão' },
      });
      fireEvent.click(screen.getByText('Salvar anamnese'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/patients/pac-1/anamnesis',
          expect.objectContaining({ method: 'PUT' }),
        );
      });
      expect(await screen.findByText('Anamnese salva')).toBeInTheDocument();
    });

    it('Dado erro ao salvar anamnese, Quando a chamada falha, Então exibe alerta de erro', async () => {
      mockFetch(
        buildRouter({
          extra: ({ url, init }) => {
            if (
              url === '/api/patients/pac-1/anamnesis' &&
              init?.method === 'PUT'
            ) {
              return errorResponse('Erro ao salvar anamnese');
            }
            return undefined;
          },
        }),
      );

      await renderDetail();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Salvar anamnese'));

      expect(
        await screen.findByText('Erro ao salvar anamnese'),
      ).toBeInTheDocument();
    });

    it('Dado erro 500 ao carregar anamnese, Quando renderizar, Então exibe alerta de erro, não formulário vazio (#65)', async () => {
      mockFetch(buildRouter({ anamnesisError: 'Erro ao carregar anamnese' }));

      await renderDetail();
      await screen.findByText('Maria Souza');

      expect(
        await screen.findByText('Erro ao carregar anamnese'),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Comorbidades')).not.toBeInTheDocument();
    });

    it('Dado anamnese ainda carregando, Quando renderizar, Então exibe indicador de carregamento, não formulário vazio (#65)', async () => {
      mockFetch(
        buildRouter({
          extra: ({ url }) => {
            if (url === '/api/patients/pac-1/anamnesis')
              return new Promise<never>(() => {});
            return undefined;
          },
        }),
      );

      await renderDetail();
      await screen.findByText('Maria Souza');

      expect(await screen.findByText('Carregando…')).toBeInTheDocument();
      expect(screen.queryByLabelText('Comorbidades')).not.toBeInTheDocument();
    });
  });

  describe('Cenário: guarda de troca de aba com formulário sujo (#66)', () => {
    it('Dado SOAP com campo preenchido, Quando trocar de aba, Então pede confirmação antes de descartar', async () => {
      mockFetch(buildRouter());

      await renderDetail();
      await screen.findByText('Maria Souza');

      fireEvent.mouseDown(screen.getByText('Evoluções (SOAP)'));
      fireEvent.click(screen.getByText('+ Nova evolução'));
      fireEvent.change(screen.getByLabelText(/S — Subjetivo/), {
        target: { value: 'Rascunho não salvo' },
      });

      fireEvent.mouseDown(screen.getByText('Anamnese'));

      expect(
        await screen.findByText('Descartar alterações?'),
      ).toBeInTheDocument();
      // Cancelar mantém a aba e o texto digitado intactos.
      fireEvent.click(screen.getByText('Cancelar'));
      expect(
        screen.queryByText('Descartar alterações?'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByDisplayValue('Rascunho não salvo'),
      ).toBeInTheDocument();
    });

    it('Dado SOAP sujo, Quando confirmar o descarte, Então troca de aba e limpa o rascunho', async () => {
      mockFetch(buildRouter());

      await renderDetail();
      await screen.findByText('Maria Souza');

      fireEvent.mouseDown(screen.getByText('Evoluções (SOAP)'));
      fireEvent.click(screen.getByText('+ Nova evolução'));
      fireEvent.change(screen.getByLabelText(/S — Subjetivo/), {
        target: { value: 'Rascunho descartável' },
      });

      fireEvent.mouseDown(screen.getByText('Anamnese'));
      fireEvent.click(await screen.findByText('Descartar e trocar'));

      expect(
        screen.queryByText('Descartar alterações?'),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Comorbidades')).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByText('Evoluções (SOAP)'));
      fireEvent.click(screen.getByText('+ Nova evolução'));
      expect(
        screen.queryByDisplayValue('Rascunho descartável'),
      ).not.toBeInTheDocument();
    });

    it('Dado anamnese alterada e não salva, Quando trocar de aba, Então pede confirmação', async () => {
      mockFetch(buildRouter({ anamnesis: anamnesisFixture }));

      await renderDetail();
      await screen.findByText('Maria Souza');

      fireEvent.change(screen.getByLabelText('Comorbidades'), {
        target: { value: 'Hipertensão não salva' },
      });

      fireEvent.mouseDown(screen.getByText('Evoluções (SOAP)'));

      expect(
        await screen.findByText('Descartar alterações?'),
      ).toBeInTheDocument();
    });

    it('Dado nenhuma alteração pendente, Quando trocar de aba, Então troca direto sem diálogo', async () => {
      mockFetch(buildRouter());

      await renderDetail();
      await screen.findByText('Maria Souza');

      fireEvent.mouseDown(screen.getByText('Evoluções (SOAP)'));

      expect(
        screen.queryByText('Descartar alterações?'),
      ).not.toBeInTheDocument();
      expect(
        await screen.findByText('Nenhuma evolução registrada.'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: conditions-section', () => {
    async function openConditionsTab() {
      await renderDetail();
      await screen.findByText('Maria Souza');
      fireEvent.mouseDown(screen.getByText(/Estomias e feridas/));
    }

    it('Dado nenhuma condição, Quando abrir a aba, Então exibe mensagem de vazio', async () => {
      mockFetch(buildRouter({ conditions: [] }));

      await openConditionsTab();

      expect(
        await screen.findByText('Nenhuma condição clínica cadastrada.'),
      ).toBeInTheDocument();
    });

    it('Dado erro 500 ao carregar condições, Quando abrir a aba, Então exibe alerta de erro, não mensagem de vazio', async () => {
      mockFetch(buildRouter({ conditionsError: 'Erro ao carregar condições' }));

      await openConditionsTab();

      expect(
        await screen.findByText('Erro ao carregar condições'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Nenhuma condição clínica cadastrada.'),
      ).not.toBeInTheDocument();
    });

    it("Dado erro ao carregar condições, Quando clicar em 'Tentar novamente', Então refaz a busca via refresh", async () => {
      let conditionsCallCount = 0;
      mockFetch(
        buildRouter({
          extra: ({ url }) => {
            if (url !== '/api/patients/pac-1/conditions') return undefined;
            conditionsCallCount += 1;
            return conditionsCallCount === 1
              ? errorResponse('Erro ao carregar condições')
              : jsonResponse([]);
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Erro ao carregar condições');

      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      expect(
        await screen.findByText('Nenhuma condição clínica cadastrada.'),
      ).toBeInTheDocument();
      expect(conditionsCallCount).toBe(2);
    });

    it('Dado condições ativas e resolvidas, Quando listar, Então exibe badges e ações corretas para cada uma', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture, resolvedConditionFixture],
        }),
      );

      await openConditionsTab();

      expect(
        await screen.findByText('Úlcera venosa perna E'),
      ).toBeInTheDocument();
      expect(screen.getByText('Em acompanhamento')).toBeInTheDocument();
      expect(screen.getByText('Resolvida')).toBeInTheDocument();
      expect(screen.getAllByText('+ Avaliação')).toHaveLength(1);
      expect(screen.getAllByText('Marcar resolvida')).toHaveLength(1);
    });

    it('Dado clique em nova condição do tipo ferida, Quando submetido, Então envia POST sem tipo de estomia', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          extra: ({ url, init }) => {
            if (
              url === '/api/patients/pac-1/conditions' &&
              init?.method === 'POST'
            ) {
              return jsonResponse({ ...woundConditionFixture, id: 'cond-new' });
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Nenhuma condição clínica cadastrada.');

      fireEvent.click(screen.getByText('+ Nova condição'));
      fireEvent.change(screen.getByLabelText(/Tipo \*/), {
        target: { value: 'wound' },
      });
      fireEvent.change(screen.getByLabelText(/Descrição\/localização/), {
        target: { value: 'Ferida no calcanhar' },
      });
      fireEvent.click(screen.getByText('Criar condição'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/patients/pac-1/conditions',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              kind: 'wound',
              title: 'Ferida no calcanhar',
              stomaType: null,
              startedAt: null,
              notes: null,
            }),
          }),
        );
      });
      expect(
        await screen.findByText('Condição registrada'),
      ).toBeInTheDocument();
    });

    it('Dado clique em nova condição do tipo estomia (padrão), Quando submetido, Então envia POST com tipo de estomia', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          extra: ({ url, init }) => {
            if (
              url === '/api/patients/pac-1/conditions' &&
              init?.method === 'POST'
            ) {
              return jsonResponse({ ...stomaConditionFixture, id: 'cond-new' });
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Nenhuma condição clínica cadastrada.');

      fireEvent.click(screen.getByText('+ Nova condição'));
      fireEvent.change(screen.getByLabelText(/Descrição\/localização/), {
        target: { value: 'Colostomia terminal QIE' },
      });
      fireEvent.click(screen.getByText('Criar condição'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/patients/pac-1/conditions',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              kind: 'stoma',
              title: 'Colostomia terminal QIE',
              stomaType: 'colostomia',
              startedAt: null,
              notes: null,
            }),
          }),
        );
      });
    });

    it('Dado erro ao criar condição, Quando a chamada falha, Então exibe alerta no formulário', async () => {
      mockFetch(
        buildRouter({
          extra: ({ url, init }) => {
            if (
              url === '/api/patients/pac-1/conditions' &&
              init?.method === 'POST'
            ) {
              return errorResponse('Erro ao criar condição');
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Nenhuma condição clínica cadastrada.');

      fireEvent.click(screen.getByText('+ Nova condição'));
      fireEvent.change(screen.getByLabelText(/Descrição\/localização/), {
        target: { value: 'Colostomia terminal QIE' },
      });
      fireEvent.click(screen.getByText('Criar condição'));

      expect(
        await screen.findByText('Erro ao criar condição'),
      ).toBeInTheDocument();
    });

    it('Dado condição de ferida, Quando abrir e enviar avaliação PUSH, Então envia POST para assessments', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound/assessments' &&
              init?.method === 'POST'
            ) {
              return jsonResponse({
                ...pushAssessmentFixture,
                id: 'assess-new',
              });
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('+ Avaliação'));
      expect(
        screen.getByText('Avaliação — Úlcera venosa perna E'),
      ).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Dor \(0–10\)/), {
        target: { value: '4' },
      });
      fireEvent.click(screen.getByText('Registrar avaliação'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/conditions/cond-wound/assessments',
          expect.objectContaining({ method: 'POST' }),
        );
      });
      const [, requestInit] = fetchMock.mock.calls.find(
        ([callUrl]) => callUrl === '/api/conditions/cond-wound/assessments',
      ) as [string, RequestInit];
      const payload = JSON.parse(String(requestInit.body)) as {
        painScale: number;
      };
      expect(payload.painScale).toBe(4);
      expect(
        await screen.findByText('Avaliação registrada'),
      ).toBeInTheDocument();
    });

    it('Dado condição de estomia, Quando abrir avaliação DET e marcar complicação, Então envia complicationCodes preenchido', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          conditions: [stomaConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-stoma/assessments' &&
              init?.method === 'POST'
            ) {
              return jsonResponse({
                ...detAssessmentFixture,
                id: 'assess-new',
              });
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Colostomia terminal QIE');

      fireEvent.click(screen.getByText('+ Avaliação'));
      expect(
        screen.getByText('Escala DET (0–15) — área 0–3 · severidade 0–2'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByText('Dermatite'));
      fireEvent.click(screen.getByText('Registrar avaliação'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/conditions/cond-stoma/assessments',
          expect.objectContaining({ method: 'POST' }),
        );
      });
      const [, requestInit] = fetchMock.mock.calls.find(
        ([callUrl]) => callUrl === '/api/conditions/cond-stoma/assessments',
      ) as [string, RequestInit];
      const payload = JSON.parse(String(requestInit.body)) as {
        complicationCodes: string;
      };
      expect(payload.complicationCodes).toBe('dermatitis');
    });

    it('Dado erro ao registrar avaliação, Quando a chamada falha, Então exibe alerta no formulário', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound/assessments' &&
              init?.method === 'POST'
            ) {
              return errorResponse('Erro ao registrar avaliação');
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('+ Avaliação'));
      fireEvent.click(screen.getByText('Registrar avaliação'));

      expect(
        await screen.findByText('Erro ao registrar avaliação'),
      ).toBeInTheDocument();
    });

    it('Dado condição expandida com avaliações registradas, Quando visualizar, Então exibe o score PUSH/DET calculado', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture, stomaConditionFixture],
          assessmentsByCondition: {
            'cond-wound': [pushAssessmentFixture],
            'cond-stoma': [detAssessmentFixture],
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getAllByText('Ver avaliações')[0]);
      expect(await screen.findByText('PUSH 7')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Ver avaliações'));
      expect(await screen.findByText('DET 5')).toBeInTheDocument();
    });

    it('Dado avaliação com dor alta (>=7), Quando visualizar, Então a célula de dor ganha destaque (PRONT-05)', async () => {
      const highPain = { ...pushAssessmentFixture, painScale: 9 };
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          assessmentsByCondition: { 'cond-wound': [highPain] },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');
      fireEvent.click(screen.getByText('Ver avaliações'));

      const cell = await screen.findByText('9/10');
      expect(cell).toHaveClass('text-danger', 'font-semibold');
    });

    it('Dado avaliação com dor baixa, Quando visualizar, Então a célula de dor NÃO tem destaque', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          assessmentsByCondition: { 'cond-wound': [pushAssessmentFixture] },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');
      fireEvent.click(screen.getByText('Ver avaliações'));

      const cell = await screen.findByText('3/10');
      expect(cell).not.toHaveClass('text-danger');
    });

    it('Dado avaliação com complicações registradas, Quando visualizar, Então a célula de complicações ganha destaque (PRONT-05)', async () => {
      mockFetch(
        buildRouter({
          conditions: [stomaConditionFixture],
          assessmentsByCondition: {
            'cond-stoma': [complicationsAssessmentFixture],
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Colostomia terminal QIE');
      fireEvent.click(screen.getByText('Ver avaliações'));

      const cell = await screen.findByText(/Dermatite; Sangramento/);
      expect(cell).toHaveClass('text-danger', 'font-semibold');
    });

    it('Dado condições ativas e resolvidas, Quando renderizar o rótulo da aba, Então conta só as ativas (PRONT-01)', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture, resolvedConditionFixture],
        }),
      );

      await renderDetail();
      await screen.findByText('Maria Souza');

      expect(screen.getByText('Estomias e feridas (1)')).toBeInTheDocument();
    });

    it('Dado clique em marcar resolvida, Quando a chamada é bem-sucedida, Então envia PATCH com action resolve', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound' &&
              init?.method === 'PATCH'
            ) {
              return jsonResponse({
                ...woundConditionFixture,
                status: 'resolved',
              });
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('Marcar resolvida'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/conditions/cond-wound',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ action: 'resolve' }),
          }),
        );
      });
      expect(await screen.findByText('Condição resolvida')).toBeInTheDocument();
    });

    it('Dado clique em marcar resolvida seguido de cancelamento no dialog, Quando acionado, Então não chama a API', async () => {
      const fetchMock = mockFetch(
        buildRouter({ conditions: [woundConditionFixture] }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('Marcar resolvida'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toBe(false);
    });

    it('Dado erro ao resolver condição, Quando a chamada falha, Então exibe alerta de erro', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound' &&
              init?.method === 'PATCH'
            ) {
              return errorResponse('Erro ao resolver condição');
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('Marcar resolvida'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Erro ao resolver condição'),
      ).toBeInTheDocument();
    });

    it('Dado erro não-Error (falha de rede bruta) ao resolver condição, Quando falhar, Então exibe mensagem padrão', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound' &&
              init?.method === 'PATCH'
            ) {
              throw 'falha de rede';
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('Marcar resolvida'));
      fireEvent.click(await screen.findByText('Confirmar'));

      expect(
        await screen.findByText('Erro ao resolver condição'),
      ).toBeInTheDocument();
    });

    it("Dado condição sem data de início registrada, Quando listar, Então não exibe texto 'desde'", async () => {
      mockFetch(
        buildRouter({
          conditions: [{ ...woundConditionFixture, startedAt: null }],
        }),
      );

      await openConditionsTab();

      expect(
        await screen.findByText('Úlcera venosa perna E'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/desde/)).not.toBeInTheDocument();
    });

    it('Dado condição expandida, Quando clicar novamente para ocultar, Então recolhe a seção de avaliações', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          assessmentsByCondition: { 'cond-wound': [pushAssessmentFixture] },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('Ver avaliações'));
      expect(await screen.findByText('PUSH 7')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Ocultar avaliações'));
      expect(screen.queryByText('PUSH 7')).not.toBeInTheDocument();
      expect(screen.getByText('Ver avaliações')).toBeInTheDocument();
    });

    it('Dado avaliação com complicações de estomia registradas, Quando expandir a condição, Então exibe os labels na leitura (#67)', async () => {
      mockFetch(
        buildRouter({
          conditions: [stomaConditionFixture],
          assessmentsByCondition: {
            'cond-stoma': [complicationsAssessmentFixture],
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Colostomia terminal QIE');

      fireEvent.click(screen.getByText('Ver avaliações'));

      expect(await screen.findByText(/Dermatite/)).toBeInTheDocument();
      expect(screen.getByText(/Sangramento/)).toBeInTheDocument();
      expect(
        screen.getByText(/Observação livre adicional/),
      ).toBeInTheDocument();
    });

    it('Dado avaliação sem complicações registradas, Quando expandir a condição, Então exibe travessão', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          assessmentsByCondition: { 'cond-wound': [pushAssessmentFixture] },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('Ver avaliações'));
      await screen.findByText('PUSH 7');

      const cells = screen.getAllByRole('cell');
      expect(cells[cells.length - 1]).toHaveTextContent('—');
    });

    it('Dado erro ao carregar avaliações, Quando expandir a condição, Então mantém a lista vazia sem quebrar', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound/assessments' &&
              (init?.method ?? 'GET') === 'GET'
            ) {
              return errorResponse('Erro ao buscar avaliações');
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('Ver avaliações'));

      expect(
        await screen.findByText('Nenhuma avaliação registrada.'),
      ).toBeInTheDocument();
    });

    it('Dado modal de nova condição aberto, Quando clicar em fechar, Então fecha sem enviar requisição', async () => {
      const fetchMock = mockFetch(buildRouter({ conditions: [] }));

      await openConditionsTab();
      await screen.findByText('Nenhuma condição clínica cadastrada.');

      fireEvent.click(screen.getByText('+ Nova condição'));
      expect(screen.getByText('Criar condição')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByText('Criar condição')).not.toBeInTheDocument();
      expect(
        fetchMock.mock.calls.some(
          ([, callInit]) => callInit?.method === 'POST',
        ),
      ).toBe(false);
    });

    it('Dado modal de avaliação aberto, Quando clicar em fechar, Então fecha sem enviar requisição', async () => {
      const fetchMock = mockFetch(
        buildRouter({ conditions: [woundConditionFixture] }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('+ Avaliação'));
      expect(
        screen.getByText('Avaliação — Úlcera venosa perna E'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByText('Registrar avaliação')).not.toBeInTheDocument();
      expect(
        fetchMock.mock.calls.some(
          ([, callInit]) => callInit?.method === 'POST',
        ),
      ).toBe(false);
    });

    it('Dado avaliação registrada com sucesso mas recarregar a lista falha, Quando salvar, Então fecha o modal mesmo assim', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (url === '/api/conditions/cond-wound/assessments') {
              if (init?.method === 'POST') {
                return jsonResponse({
                  ...pushAssessmentFixture,
                  id: 'assess-new',
                });
              }
              return errorResponse('Erro ao buscar avaliações');
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('+ Avaliação'));
      fireEvent.click(screen.getByText('Registrar avaliação'));

      await waitFor(() => {
        expect(
          screen.queryByText('Registrar avaliação'),
        ).not.toBeInTheDocument();
      });
    });

    it('Dado preenchimento completo do formulário de nova condição (estomia), Quando submeter, Então envia tipo de estomia, data de início e observações', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          extra: ({ url, init }) => {
            if (
              url === '/api/patients/pac-1/conditions' &&
              init?.method === 'POST'
            ) {
              return jsonResponse({ ...stomaConditionFixture, id: 'cond-new' });
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Nenhuma condição clínica cadastrada.');

      fireEvent.click(screen.getByText('+ Nova condição'));
      fireEvent.change(screen.getByLabelText(/Tipo de estomia/), {
        target: { value: 'urostomia' },
      });
      fireEvent.change(screen.getByLabelText(/Descrição\/localização/), {
        target: { value: 'Urostomia QID' },
      });
      fireEvent.change(screen.getByLabelText(/Início/), {
        target: { value: '2026-02-10' },
      });
      fireEvent.change(screen.getByLabelText('Observações'), {
        target: { value: 'Sem intercorrências' },
      });
      fireEvent.click(screen.getByText('Criar condição'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/patients/pac-1/conditions',
          expect.objectContaining({ method: 'POST' }),
        );
      });
      const [, requestInit] = fetchMock.mock.calls.find(
        ([callUrl, callInit]) =>
          callUrl === '/api/patients/pac-1/conditions' &&
          callInit?.method === 'POST',
      ) as [string, RequestInit];
      const payload = JSON.parse(String(requestInit.body)) as {
        stomaType: string;
        startedAt: string | null;
        notes: string | null;
      };
      expect(payload.stomaType).toBe('urostomia');
      expect(payload.startedAt).not.toBeNull();
      expect(payload.notes).toBe('Sem intercorrências');
    });

    it('Dado erro não-Error (falha de rede bruta) ao criar condição, Quando falhar, Então exibe mensagem padrão', async () => {
      mockFetch(
        buildRouter({
          extra: ({ url, init }) => {
            if (
              url === '/api/patients/pac-1/conditions' &&
              init?.method === 'POST'
            ) {
              throw 'falha de rede';
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Nenhuma condição clínica cadastrada.');

      fireEvent.click(screen.getByText('+ Nova condição'));
      fireEvent.change(screen.getByLabelText(/Descrição\/localização/), {
        target: { value: 'Colostomia terminal QIE' },
      });
      fireEvent.click(screen.getByText('Criar condição'));

      expect(
        await screen.findByText('Erro ao criar condição'),
      ).toBeInTheDocument();
    });

    it('Dado preenchimento completo do formulário PUSH, Quando registrar avaliação, Então envia dimensões, tecido e exsudato preenchidos', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound/assessments' &&
              init?.method === 'POST'
            ) {
              return jsonResponse({
                ...pushAssessmentFixture,
                id: 'assess-new',
              });
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('+ Avaliação'));
      fireEvent.change(screen.getByLabelText(/Comprimento/), {
        target: { value: '12' },
      });
      fireEvent.change(screen.getByLabelText(/Largura/), {
        target: { value: '6' },
      });
      fireEvent.change(screen.getByLabelText(/Profundidade/), {
        target: { value: '3' },
      });
      fireEvent.change(screen.getByLabelText(/Tecido predominante/), {
        target: { value: 'granulation' },
      });
      fireEvent.change(screen.getByLabelText(/Exsudato/), {
        target: { value: 'moderate' },
      });
      fireEvent.change(screen.getByLabelText('Observações'), {
        target: { value: 'Boa evolução' },
      });
      fireEvent.click(screen.getByText('Registrar avaliação'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/conditions/cond-wound/assessments',
          expect.objectContaining({ method: 'POST' }),
        );
      });
      const [, requestInit] = fetchMock.mock.calls.find(
        ([callUrl]) => callUrl === '/api/conditions/cond-wound/assessments',
      ) as [string, RequestInit];
      const payload = JSON.parse(String(requestInit.body)) as {
        lengthMm: number;
        widthMm: number;
        depthMm: number;
        tissueType: string;
        exudate: string;
        notes: string;
      };
      expect(payload.lengthMm).toBe(12);
      expect(payload.widthMm).toBe(6);
      expect(payload.depthMm).toBe(3);
      expect(payload.tissueType).toBe('granulation');
      expect(payload.exudate).toBe('moderate');
      expect(payload.notes).toBe('Boa evolução');
    });

    it('Dado preenchimento completo do formulário DET, Quando registrar avaliação, Então envia pele periestomal, complicações, domínio DET e desmarca complicação', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          conditions: [stomaConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-stoma/assessments' &&
              init?.method === 'POST'
            ) {
              return jsonResponse({
                ...detAssessmentFixture,
                id: 'assess-new',
              });
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Colostomia terminal QIE');

      fireEvent.click(screen.getByText('+ Avaliação'));

      // Marca e desmarca a mesma complicação (exercita o ramo de remoção do toggle).
      fireEvent.click(screen.getByText('Dermatite'));
      fireEvent.click(screen.getByText('Dermatite'));

      fireEvent.change(screen.getByLabelText(/Pele periestomal/), {
        target: { value: 'Íntegra, sem sinais de irritação' },
      });
      fireEvent.change(screen.getByLabelText(/Observação de complicações/), {
        target: { value: 'Nenhuma no momento' },
      });
      const [areaInput, severityInput] =
        screen.getAllByPlaceholderText(/área|sev\./);
      fireEvent.change(areaInput, { target: { value: '2' } });
      fireEvent.change(severityInput, { target: { value: '1' } });
      fireEvent.click(screen.getByText('Registrar avaliação'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/conditions/cond-stoma/assessments',
          expect.objectContaining({ method: 'POST' }),
        );
      });
      const [, requestInit] = fetchMock.mock.calls.find(
        ([callUrl]) => callUrl === '/api/conditions/cond-stoma/assessments',
      ) as [string, RequestInit];
      const payload = JSON.parse(String(requestInit.body)) as {
        complicationCodes: string | null;
        skinCondition: string;
        complications: string;
        detDiscolorationArea: number;
        detDiscolorationSeverity: number;
      };
      expect(payload.complicationCodes).toBeNull();
      expect(payload.skinCondition).toBe('Íntegra, sem sinais de irritação');
      expect(payload.complications).toBe('Nenhuma no momento');
      expect(payload.detDiscolorationArea).toBe(2);
      expect(payload.detDiscolorationSeverity).toBe(1);
    });

    it('Dado erro não-Error (falha de rede bruta) ao registrar avaliação, Quando falhar, Então exibe mensagem padrão', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound/assessments' &&
              init?.method === 'POST'
            ) {
              throw 'falha de rede';
            }
            return undefined;
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('+ Avaliação'));
      fireEvent.click(screen.getByText('Registrar avaliação'));

      expect(
        await screen.findByText('Erro ao registrar avaliação'),
      ).toBeInTheDocument();
    });

    it('Dado avaliação com comprimento preenchido mas largura e profundidade nulas, Quando expandir, Então exibe o traço para os campos ausentes', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          assessmentsByCondition: {
            'cond-wound': [
              {
                ...pushAssessmentFixture,
                id: 'assess-partial',
                widthMm: null,
                depthMm: null,
              },
            ],
          },
        }),
      );

      await openConditionsTab();
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('Ver avaliações'));

      expect(await screen.findByText('10×—×—')).toBeInTheDocument();
    });
  });

  describe('Cenário: condition-photos', () => {
    async function expandWoundCondition() {
      await renderDetail();
      await screen.findByText('Maria Souza');
      fireEvent.mouseDown(screen.getByText(/Estomias e feridas/));
      await screen.findByText('Úlcera venosa perna E');
      fireEvent.click(screen.getByText('Ver avaliações'));
    }

    it('Dado condição sem fotos, Quando expandir, Então exibe mensagem de vazio', async () => {
      mockFetch(buildRouter({ conditions: [woundConditionFixture] }));

      await expandWoundCondition();

      expect(
        await screen.findByText('Nenhuma foto registrada.'),
      ).toBeInTheDocument();
    });

    it('Dado erro 500 ao carregar fotos, Quando expandir, Então exibe alerta de erro, não mensagem de vazio', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url }) => {
            if (url === '/api/conditions/cond-wound/photos') {
              return errorResponse('Erro ao carregar fotos');
            }
            return undefined;
          },
        }),
      );

      await expandWoundCondition();

      expect(
        await screen.findByText('Erro ao carregar fotos'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Nenhuma foto registrada.'),
      ).not.toBeInTheDocument();
    });

    it("Dado erro ao carregar fotos, Quando clicar em 'Tentar novamente', Então refaz a busca", async () => {
      let photosCallCount = 0;
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url }) => {
            if (url === '/api/conditions/cond-wound/photos') {
              photosCallCount += 1;
              return photosCallCount === 1
                ? errorResponse('Erro ao carregar fotos')
                : jsonResponse([]);
            }
            return undefined;
          },
        }),
      );

      await expandWoundCondition();
      await screen.findByText('Erro ao carregar fotos');

      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      expect(
        await screen.findByText('Nenhuma foto registrada.'),
      ).toBeInTheDocument();
      expect(photosCallCount).toBe(2);
    });

    it('Dado duas ou mais fotos, Quando expandir, Então exibe comparação entre a primeira e a última', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          photosByCondition: {
            'cond-wound': [photoFixture, laterPhotoFixture],
          },
        }),
      );

      await expandWoundCondition();

      expect(
        await screen.findByText(
          `Primeira — ${formatDate(photoFixture.createdAt)}`,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`Atual — ${formatDate(laterPhotoFixture.createdAt)}`),
      ).toBeInTheDocument();
    });

    it('Dado fotos fora de ordem de chegada, Quando renderizar a tira, Então corre na mesma direção da comparação (mais antiga primeiro) (PRONT-03)', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          // API devolve fora de ordem cronológica de propósito — a tira precisa
          // ordenar por conta própria, não confiar na ordem de chegada.
          photosByCondition: {
            'cond-wound': [laterPhotoFixture, photoFixture],
          },
        }),
      );

      await expandWoundCondition();
      await screen.findByText(
        `Primeira — ${formatDate(photoFixture.createdAt)}`,
      );

      const stripAlts = Array.from(document.querySelectorAll('figure img'))
        .map((img) => img.getAttribute('alt'))
        .filter((alt): alt is string => Boolean(alt?.startsWith('Foto de')));
      expect(stripAlts[0]).toBe(
        `Foto de ${formatDate(photoFixture.createdAt)}`,
      );
      expect(stripAlts[1]).toBe(
        `Foto de ${formatDate(laterPhotoFixture.createdAt)}`,
      );
    });

    it('Dado upload de foto válida, Quando enviado, Então chama POST multipart e a lista passa a mostrar a foto nova', async () => {
      let uploaded = false;
      const fetchMock = mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound/photos' &&
              init?.method === 'POST'
            ) {
              uploaded = true;
              return rawResponse(true, { ok: true });
            }
            if (
              url === '/api/conditions/cond-wound/photos' &&
              (init?.method ?? 'GET') === 'GET'
            ) {
              return jsonResponse(uploaded ? [photoFixture] : []);
            }
            return undefined;
          },
        }),
      );

      await expandWoundCondition();
      await screen.findByText('Nenhuma foto registrada.');

      const file = new File(['conteudo'], 'foto.png', { type: 'image/png' });
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      expect(input).toHaveAttribute(
        'accept',
        'image/jpeg,image/png,image/webp',
      );
      expect(input).not.toBeDisabled();

      fireEvent.change(input, { target: { files: [file] } });

      // Desabilita durante o envio (disabled={uploading}) e reseta o value
      // logo após disparar o upload (e.target.value = ""), evitando reenvio
      // do mesmo arquivo se o usuário selecionar de novo.
      expect(input).toBeDisabled();
      expect(input.value).toBe('');

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/conditions/cond-wound/photos',
          expect.objectContaining({ method: 'POST' }),
        );
      });
      await waitFor(() => expect(input).not.toBeDisabled());
      expect(await screen.findByText('Foto enviada')).toBeInTheDocument();
      expect(
        await screen.findByAltText(
          `Foto de ${formatDate(photoFixture.createdAt)}`,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Nenhuma foto registrada.'),
      ).not.toBeInTheDocument();
    });

    it('Dado arquivo maior que 5MB, Quando selecionado, Então exibe erro de validação local sem chamar a API', async () => {
      const fetchMock = mockFetch(
        buildRouter({ conditions: [woundConditionFixture] }),
      );

      await expandWoundCondition();
      await screen.findByText('Nenhuma foto registrada.');

      const bigFile = new File(['conteudo'], 'foto-grande.png', {
        type: 'image/png',
      });
      Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [bigFile] } });

      expect(
        await screen.findByText('Imagem excede o limite de 5 MB'),
      ).toBeInTheDocument();
      expect(
        fetchMock.mock.calls.some(
          ([callUrl, callInit]) =>
            String(callUrl).endsWith('/photos') && callInit?.method === 'POST',
        ),
      ).toBe(false);
    });

    it('Dado erro retornado pela API ao enviar foto, Quando falha, Então exibe a mensagem de erro', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound/photos' &&
              init?.method === 'POST'
            ) {
              return rawResponse(false, {
                error: 'Formato de imagem inválido',
              });
            }
            return undefined;
          },
        }),
      );

      await expandWoundCondition();
      await screen.findByText('Nenhuma foto registrada.');

      const file = new File(['conteudo'], 'foto.png', { type: 'image/png' });
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      expect(
        await screen.findByText('Formato de imagem inválido'),
      ).toBeInTheDocument();
    });

    it('Dado clique em excluir foto, Quando a chamada é bem-sucedida, Então envia DELETE e a foto some da lista', async () => {
      let deleted = false;
      const fetchMock = mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (url === '/api/photos/photo-1' && init?.method === 'DELETE') {
              deleted = true;
              return jsonResponse({ deleted: true });
            }
            if (
              url === '/api/conditions/cond-wound/photos' &&
              (init?.method ?? 'GET') === 'GET'
            ) {
              return jsonResponse(deleted ? [] : [photoFixture]);
            }
            return undefined;
          },
        }),
      );

      await expandWoundCondition();
      expect(await screen.findByText('excluir')).toBeInTheDocument();

      fireEvent.click(screen.getByText('excluir'));
      fireEvent.click(await screen.findByText('Excluir'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/photos/photo-1',
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
      expect(await screen.findByText('Foto excluída')).toBeInTheDocument();
      expect(
        await screen.findByText('Nenhuma foto registrada.'),
      ).toBeInTheDocument();
    });

    it('Dado clique em excluir foto seguido de cancelamento no dialog, Quando acionado, Então não chama a API', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          photosByCondition: { 'cond-wound': [photoFixture] },
        }),
      );

      await expandWoundCondition();
      expect(await screen.findByText('excluir')).toBeInTheDocument();

      fireEvent.click(screen.getByText('excluir'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(
        fetchMock.mock.calls.some(
          ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
        ),
      ).toBe(false);
    });

    it('Dado resposta de erro sem corpo JSON válido, Quando enviar foto, Então exibe mensagem padrão de erro', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound/photos' &&
              init?.method === 'POST'
            ) {
              return {
                ok: false,
                json: async () => {
                  throw new Error('corpo inválido');
                },
              };
            }
            return undefined;
          },
        }),
      );

      await expandWoundCondition();
      await screen.findByText('Nenhuma foto registrada.');

      const file = new File(['conteudo'], 'foto.png', { type: 'image/png' });
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      expect(
        await screen.findByText('Erro ao enviar foto'),
      ).toBeInTheDocument();
    });

    it('Dado falha de rede bruta (não Error) ao enviar foto, Quando falhar, Então exibe mensagem padrão de erro', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound/photos' &&
              init?.method === 'POST'
            ) {
              throw 'falha de rede';
            }
            return undefined;
          },
        }),
      );

      await expandWoundCondition();
      await screen.findByText('Nenhuma foto registrada.');

      const file = new File(['conteudo'], 'foto.png', { type: 'image/png' });
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      expect(
        await screen.findByText('Erro ao enviar foto'),
      ).toBeInTheDocument();
    });

    it('Dado falha de rede bruta (não Error) ao excluir foto, Quando falhar, Então exibe mensagem padrão de erro', async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          photosByCondition: { 'cond-wound': [photoFixture] },
          extra: ({ url, init }) => {
            if (url === '/api/photos/photo-1' && init?.method === 'DELETE') {
              throw 'falha de rede';
            }
            return undefined;
          },
        }),
      );

      await expandWoundCondition();
      expect(await screen.findByText('excluir')).toBeInTheDocument();

      fireEvent.click(screen.getByText('excluir'));
      fireEvent.click(await screen.findByText('Excluir'));

      expect(
        await screen.findByText('Erro ao excluir foto'),
      ).toBeInTheDocument();
    });

    it("Dado erro ao enviar foto com lista já carregada, Quando falhar, Então exibe erro sem botão 'Tentar novamente' e mantém as fotos existentes", async () => {
      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          photosByCondition: { 'cond-wound': [photoFixture] },
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound/photos' &&
              init?.method === 'POST'
            ) {
              return {
                ok: false,
                status: 500,
                json: async () => ({ error: 'Erro ao enviar foto' }),
              };
            }
            return undefined;
          },
        }),
      );

      await expandWoundCondition();
      expect(await screen.findByText('excluir')).toBeInTheDocument();

      const file = new File(['conteudo'], 'foto.png', { type: 'image/png' });
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      expect(
        await screen.findByText('Erro ao enviar foto'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Tentar novamente' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('excluir')).toBeInTheDocument();
    });

    it('Dado componente de fotos desmontado antes da resposta, Quando a busca falhar depois, Então ignora o erro silenciosamente', async () => {
      let rejectPhotos: (reason: unknown) => void = () => undefined;
      const pendingPhotos = new Promise<MockedResponse>((_, reject) => {
        rejectPhotos = reject;
      });

      mockFetch(
        buildRouter({
          conditions: [woundConditionFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/conditions/cond-wound/photos' &&
              (init?.method ?? 'GET') === 'GET'
            ) {
              return pendingPhotos;
            }
            return undefined;
          },
        }),
      );

      await renderDetail();
      await screen.findByText('Maria Souza');
      fireEvent.mouseDown(screen.getByText(/Estomias e feridas/));
      await screen.findByText('Úlcera venosa perna E');

      fireEvent.click(screen.getByText('Ver avaliações'));
      fireEvent.click(screen.getByText('Ocultar avaliações'));

      await act(async () => {
        rejectPhotos('falha depois de desmontar');
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(screen.getByText('Úlcera venosa perna E')).toBeInTheDocument();
    });
  });

  describe('Cenário: evolutions-section', () => {
    async function openEvolutionsTab() {
      await renderDetail();
      await screen.findByText('Maria Souza');
      fireEvent.mouseDown(screen.getByText(/Evoluções \(SOAP\)/));
    }

    it('Dado nenhuma evolução, Quando abrir a aba, Então exibe mensagem de vazio', async () => {
      mockFetch(buildRouter({ evolutions: [] }));

      await openEvolutionsTab();

      expect(
        await screen.findByText('Nenhuma evolução registrada.'),
      ).toBeInTheDocument();
    });

    it("Dado evolução com só o campo Plano preenchido, Quando listar, Então os 4 rótulos aparecem e os vazios mostram '— não preenchido —' (PRONT-02)", async () => {
      const partial: EvolutionNoteDto = {
        ...evolutionFixture,
        id: 'evo-partial',
        subjective: '',
        objective: '',
        assessment: '',
      };
      mockFetch(buildRouter({ evolutions: [partial] }));

      await openEvolutionsTab();

      expect(await screen.findByText('S — Subjetivo')).toBeInTheDocument();
      expect(screen.getByText('O — Objetivo')).toBeInTheDocument();
      expect(screen.getByText('A — Avaliação')).toBeInTheDocument();
      expect(screen.getByText('P — Plano')).toBeInTheDocument();
      expect(screen.getAllByText('— não preenchido —')).toHaveLength(3);
      expect(screen.getByText('Manter curativo atual')).toBeInTheDocument();
    });

    it("Dado 15 evoluções, Quando abrir a aba, Então mostra 10 e o botão 'Ver mais'; clicar revela as 15 (PRONT-08)", async () => {
      const many: EvolutionNoteDto[] = Array.from({ length: 15 }, (_, i) => ({
        ...evolutionFixture,
        id: `evo-${i}`,
        objective: `Nota número ${i}`,
      }));
      mockFetch(buildRouter({ evolutions: many }));

      await openEvolutionsTab();
      await screen.findByText('Nota número 0');

      expect(screen.queryByText('Nota número 10')).not.toBeInTheDocument();
      expect(screen.getByText('Ver mais (5)')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Ver mais (5)'));

      expect(screen.getByText('Nota número 14')).toBeInTheDocument();
      expect(screen.queryByText(/Ver mais/)).not.toBeInTheDocument();
    });

    it("Dado 10 evoluções (limite exato), Quando abrir a aba, Então mostra todas sem o botão 'Ver mais' (PRONT-08)", async () => {
      const ten: EvolutionNoteDto[] = Array.from({ length: 10 }, (_, i) => ({
        ...evolutionFixture,
        id: `evo-${i}`,
        objective: `Nota número ${i}`,
      }));
      mockFetch(buildRouter({ evolutions: ten }));

      await openEvolutionsTab();
      await screen.findByText('Nota número 0');

      expect(screen.getByText('Nota número 9')).toBeInTheDocument();
      expect(screen.queryByText(/Ver mais/)).not.toBeInTheDocument();
    });

    it('Dado erro 500 ao carregar evoluções, Quando abrir a aba, Então exibe alerta de erro, não mensagem de vazio', async () => {
      mockFetch(buildRouter({ evolutionsError: 'Erro ao carregar evoluções' }));

      await openEvolutionsTab();

      expect(
        await screen.findByText('Erro ao carregar evoluções'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Nenhuma evolução registrada.'),
      ).not.toBeInTheDocument();
    });

    it("Dado erro ao carregar evoluções, Quando clicar em 'Tentar novamente', Então refaz a busca via refresh", async () => {
      let evolutionsCallCount = 0;
      mockFetch(
        buildRouter({
          extra: ({ url }) => {
            if (url !== '/api/patients/pac-1/evolutions') return undefined;
            evolutionsCallCount += 1;
            return evolutionsCallCount === 1
              ? errorResponse('Erro ao carregar evoluções')
              : jsonResponse([]);
          },
        }),
      );

      await openEvolutionsTab();
      await screen.findByText('Erro ao carregar evoluções');

      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      expect(
        await screen.findByText('Nenhuma evolução registrada.'),
      ).toBeInTheDocument();
      expect(evolutionsCallCount).toBe(2);
    });

    it('Dado evolução registrada, Quando listar, Então exibe dados SOAP e profissional responsável', async () => {
      mockFetch(
        buildRouter({
          evolutions: [evolutionFixture],
          professionals: [professionalFixture],
        }),
      );

      await openEvolutionsTab();

      expect(await screen.findByText(/Dor leve na região/)).toBeInTheDocument();
      expect(
        screen.getByText(/Ferida limpa, sem sinais de infecção/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(formatDateTime(evolutionFixture.createdAt), {
          exact: false,
        }),
      ).toBeInTheDocument();
      expect(screen.getByText(/Dra\. Ana/)).toBeInTheDocument();
    });

    it('Evolução mostra o autor pela lista reduzida de profissionais', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          evolutions: [evolutionFixture],
          professionals: [{ id: 'prof-1', fullName: 'Dra. Ana', active: true }],
          role: 'profissional',
        }),
      );

      await openEvolutionsTab();

      expect(await screen.findByText(/Dra\. Ana/)).toBeInTheDocument();
      const urls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(urls).toContain('/api/options/professionals');
      expect(urls).not.toContain('/api/professionals');
    });

    it('Dado preenchimento do formulário SOAP, Quando submetido, Então envia POST e fecha o formulário', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          professionals: [professionalFixture],
          extra: ({ url, init }) => {
            if (
              url === '/api/patients/pac-1/evolutions' &&
              init?.method === 'POST'
            ) {
              return jsonResponse({ ...evolutionFixture, id: 'evo-new' });
            }
            return undefined;
          },
        }),
      );

      await openEvolutionsTab();
      await screen.findByText('Nenhuma evolução registrada.');

      fireEvent.click(screen.getByText('+ Nova evolução'));
      fireEvent.change(screen.getByLabelText(/S — Subjetivo/), {
        target: { value: 'Queixa de dor' },
      });
      fireEvent.change(screen.getByLabelText(/P — Plano/), {
        target: { value: 'Trocar curativo' },
      });
      fireEvent.click(screen.getByText('Registrar evolução'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/patients/pac-1/evolutions',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              subjective: 'Queixa de dor',
              objective: '',
              assessment: '',
              plan: 'Trocar curativo',
            }),
          }),
        );
      });
      await waitFor(() => {
        expect(
          screen.queryByText('Registrar evolução'),
        ).not.toBeInTheDocument();
      });
      expect(
        await screen.findByText('Evolução registrada'),
      ).toBeInTheDocument();
    });

    it('Dado formulário de nova evolução aberto, Quando renderizar, Então não exibe seletor de profissional (#64)', async () => {
      mockFetch(buildRouter({ professionals: [professionalFixture] }));

      await openEvolutionsTab();
      await screen.findByText('Nenhuma evolução registrada.');

      fireEvent.click(screen.getByText('+ Nova evolução'));

      expect(
        screen.queryByText('Profissional responsável'),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('Dado erro ao registrar evolução, Quando a chamada falha, Então exibe alerta de erro', async () => {
      mockFetch(
        buildRouter({
          extra: ({ url, init }) => {
            if (
              url === '/api/patients/pac-1/evolutions' &&
              init?.method === 'POST'
            ) {
              return errorResponse('Erro ao registrar evolução');
            }
            return undefined;
          },
        }),
      );

      await openEvolutionsTab();
      await screen.findByText('Nenhuma evolução registrada.');

      fireEvent.click(screen.getByText('+ Nova evolução'));
      fireEvent.click(screen.getByText('Registrar evolução'));

      expect(
        await screen.findByText('Erro ao registrar evolução'),
      ).toBeInTheDocument();
    });
  });
});

describe('Feature: Pacotes no prontuário (COMP3-10)', () => {
  it('Dado pacote com validade, Quando abrir a aba Pacotes, Então exibe saldo e validade', async () => {
    mockFetch(
      buildRouter({
        packages: [
          {
            id: 'pkg-1',
            procedureId: 'proc-1',
            procedureName: 'Curativo especial',
            totalSessions: 10,
            usedSessions: 3,
            remainingSessions: 7,
            priceCents: 120000,
            expiresAt: '2030-06-30T23:59:59.000Z',
            active: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    await renderDetail();
    await screen.findByText('Maria Souza');

    fireEvent.mouseDown(screen.getByText('Pacotes'));

    expect(await screen.findByText('Curativo especial')).toBeInTheDocument();
    expect(screen.getByText('7 de 10 sessões restantes')).toBeInTheDocument();
    expect(screen.getByText(/Válido até 30\/06\/2030/)).toBeInTheDocument();
  });

  it('Dado pacote expirado, Quando abrir a aba Pacotes, Então destaca a expiração', async () => {
    mockFetch(
      buildRouter({
        packages: [
          {
            id: 'pkg-2',
            procedureId: 'proc-1',
            procedureName: 'Curativo especial',
            totalSessions: 5,
            usedSessions: 0,
            remainingSessions: 5,
            priceCents: 50000,
            expiresAt: '2020-01-01T00:00:00.000Z',
            active: true,
            createdAt: '2019-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    await renderDetail();
    await screen.findByText('Maria Souza');

    fireEvent.mouseDown(screen.getByText('Pacotes'));

    const expired = await screen.findByText(/Expirado em 01\/01\/2020/);
    expect(expired).toHaveClass('text-danger');
  });

  it('Dado paciente sem pacotes, Quando abrir a aba, Então exibe estado vazio', async () => {
    mockFetch(buildRouter());
    await renderDetail();
    await screen.findByText('Maria Souza');

    fireEvent.mouseDown(screen.getByText('Pacotes'));

    expect(
      await screen.findByText('Nenhum pacote de sessões para este paciente.'),
    ).toBeInTheDocument();
  });
});
