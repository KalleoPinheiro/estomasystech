// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PatientsPage from '@/app/(staff)/pacientes/page';
import type { UserRole } from '@/domain/auth/user-role';
import type { PartnerDto, PatientDto } from '@/lib/dto';
import { formatDate } from '@/lib/format';
import { renderServerPage } from '../support/server-page';

const mocks = vi.hoisted(() => ({
  requireStaffPageFor: vi.fn(),
  listPatientsPage: vi.fn(),
  listPartnersFor: vi.fn(),
  createPatient: vi.fn(),
}));

// A lista é Server Component (#549): sessão e dados vêm da camada do servidor.
vi.mock('@/lib/server/session', () => ({
  requireStaffPageFor: mocks.requireStaffPageFor,
}));
vi.mock('@/lib/server/data/patients', () => ({
  listPatientsPage: mocks.listPatientsPage,
}));
vi.mock('@/lib/server/data/partners', () => ({
  listPartnersFor: mocks.listPartnersFor,
}));
vi.mock('@/app/(staff)/pacientes/actions', () => ({
  createPatient: mocks.createPatient,
}));

interface FetchCall {
  url: string;
  init?: RequestInit;
}

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  json: async () => ({ success: ok, data, error: ok ? null : 'Erro' }),
});

const errorResponse = (message: string) => ({
  ok: false,
  json: async () => ({ success: false, data: null, error: message }),
});

const mockFetch = (
  router: (call: FetchCall) => { ok: boolean; json: () => Promise<unknown> },
): ReturnType<typeof vi.fn> => {
  const fn = vi.fn(async (url: string, init?: RequestInit) =>
    router({ url, init }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const partnerFixture: PartnerDto = {
  id: 'partner-1',
  fullName: 'Dr. João',
  email: 'joao@parceiro.com',
  phone: '11999999999',
  crm: 'CRM-SP 123',
  specialty: 'Vascular',
  active: true,
};

const patientFixture: PatientDto = {
  id: 'pat-1',
  fullName: 'Maria Souza',
  email: 'maria@example.com',
  phone: '11988887777',
  phoneNeedsCorrection: false,
  cpfMasked: null,
  birthDate: '1990-05-10T00:00:00.000Z',
  notes: null,
  referredByPartnerId: null,
  guardianId: null,
  guardianPortalRevokedAt: null,
  active: true,
  anonymized: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const inactivePatientFixture: PatientDto = {
  ...patientFixture,
  id: 'pat-2',
  fullName: 'João Pereira',
  email: 'joao.pereira@example.com',
  phone: '11966665555',
  phoneNeedsCorrection: false,
  cpfMasked: null,
  birthDate: null,
  active: false,
};

interface RouterOptions {
  patients?: PatientDto[];
  partners?: PartnerDto[];
  extra?: (
    call: FetchCall,
  ) => { ok: boolean; json: () => Promise<unknown> } | undefined;
}

/** O que o servidor leu para a 1ª página: o mesmo que a rota devolveria. */
let served: { patients: PatientDto[]; partners: PartnerDto[]; role: UserRole } =
  { patients: [], partners: [], role: 'company_admin' };

function buildRouter({
  patients = [],
  partners = [],
  extra,
}: RouterOptions = {}) {
  served = { patients, partners, role: 'company_admin' };
  return ({ url, init }: FetchCall) => {
    const method = init?.method ?? 'GET';
    if (extra) {
      const custom = extra({ url, init });
      if (custom) return custom;
    }
    if (url.startsWith('/api/partners')) {
      return jsonResponse(partners);
    }
    if (url.startsWith('/api/patients') && method === 'GET') {
      return jsonResponse(patients);
    }
    return jsonResponse(null, false);
  };
}

const created = (id: string) => ({
  success: true,
  data: { ...patientFixture, id },
  error: null,
});

/** Renderiza a página como o servidor a entrega, com a 1ª página já lida. */
async function renderPatientsPage() {
  mocks.requireStaffPageFor.mockResolvedValue({
    role: served.role,
    subject: 'admin@clinica.com',
  });
  mocks.listPatientsPage.mockResolvedValue({
    items: served.patients,
    nextCursor: null,
  });
  mocks.listPartnersFor.mockResolvedValue(served.partners);
  return renderServerPage(PatientsPage);
}

describe('Feature: PatientsPage', () => {
  describe('Cenário: listagem', () => {
    it('Dado nenhum paciente, Quando a página carrega, Então exibe mensagem de vazio', async () => {
      mockFetch(buildRouter({ patients: [] }));

      await renderPatientsPage();

      expect(
        await screen.findByText('Nenhum paciente cadastrado.'),
      ).toBeInTheDocument();
    });

    it('Dado pacientes cadastrados, Quando a página carrega, Então lista nome, contato, nascimento e situação', async () => {
      mockFetch(
        buildRouter({ patients: [patientFixture, inactivePatientFixture] }),
      );

      await renderPatientsPage();

      expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
      expect(screen.getByText('maria@example.com')).toBeInTheDocument();
      expect(screen.getByText('11988887777')).toBeInTheDocument();
      expect(
        screen.getByText(formatDate(patientFixture.birthDate as string)),
      ).toBeInTheDocument();
      expect(screen.getByText('Ativo')).toBeInTheDocument();
      expect(screen.getByText('João Pereira')).toBeInTheDocument();
      expect(screen.getByText('Inativo')).toBeInTheDocument();
    });

    it('Dado paciente inativo, Quando renderizar a linha, Então usa fundo tingido em vez de opacity-50 (PRONT-12)', async () => {
      mockFetch(buildRouter({ patients: [inactivePatientFixture] }));

      await renderPatientsPage();
      const row = (await screen.findByText('João Pereira')).closest('tr');

      expect(row).toHaveClass('bg-surface-2/60');
      expect(row).not.toHaveClass('opacity-50');
    });

    it("Dado a linha do paciente, Quando renderizar as ações, Então 'Prontuário' tem mais peso e as demais são Button ghost/sm (PRONT-11)", async () => {
      mockFetch(buildRouter({ patients: [patientFixture] }));

      await renderPatientsPage();
      await screen.findByText('Maria Souza');

      expect(screen.getByText('Prontuário')).toHaveClass('font-semibold');
      const editButton = screen.getByText('Editar');
      expect(editButton).toHaveClass('sv-btn--ghost', 'sv-btn--sm');
    });

    it('Dado busca sem resultado, Quando renderizar o vazio, Então a mensagem cita o termo buscado (PRONT-13)', async () => {
      const fetchMock = mockFetch(buildRouter({ patients: [] }));

      await renderPatientsPage();
      await screen.findByText('Nenhum paciente cadastrado.');

      fireEvent.change(
        screen.getByPlaceholderText('Buscar por nome, email ou telefone…'),
        {
          target: { value: 'Zzz' },
        },
      );

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(([url]) =>
            String(url).includes('search=Zzz'),
          ),
        ).toBe(true);
      });
      expect(
        await screen.findByText('Nenhum paciente encontrado para "Zzz".'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: busca', () => {
    it('Dado texto digitado na busca, Quando o debounce expira, Então refaz a busca com o parâmetro search', async () => {
      const fetchMock = mockFetch(buildRouter({ patients: [patientFixture] }));

      await renderPatientsPage();
      await screen.findByText('Maria Souza');

      fireEvent.change(
        screen.getByPlaceholderText('Buscar por nome, email ou telefone…'),
        {
          target: { value: 'Maria' },
        },
      );

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(([url]) =>
            String(url).includes('search=Maria'),
          ),
        ).toBe(true);
      });
    });

    it('Dado busca disparando nova requisição, Quando a resposta ainda não chegou, Então a tabela fica marcada como obsoleta (aria-busy) sem sumir (PRONT-10)', async () => {
      mockFetch(
        buildRouter({
          patients: [patientFixture],
          extra: ({ url, init }) => {
            const method = init?.method ?? 'GET';
            if (url.startsWith('/api/patients') && method === 'GET') {
              // A montagem não busca (a 1ª página veio do servidor); a busca
              // nunca resolve — só precisamos observar o estado "em voo".
              return { ok: true, json: () => new Promise<never>(() => {}) };
            }
            return undefined;
          },
        }),
      );

      await renderPatientsPage();
      await screen.findByText('Maria Souza');

      fireEvent.change(
        screen.getByPlaceholderText('Buscar por nome, email ou telefone…'),
        {
          target: { value: 'Maria' },
        },
      );

      await waitFor(() => {
        const container = screen
          .getByText('Maria Souza')
          .closest('[aria-busy="true"]');
        expect(container).not.toBeNull();
      });
    });
  });

  describe('Cenário: telefone em E.164 (#324)', () => {
    const legacyFixture: PatientDto = {
      ...patientFixture,
      id: 'pat-legacy',
      fullName: 'Lia Legado',
      email: 'lia@example.com',
      phone: '(11) 9999',
      phoneNeedsCorrection: true,
    };
    const e164Fixture: PatientDto = {
      ...patientFixture,
      id: 'pat-e164',
      fullName: 'Eva Nova',
      email: 'eva@example.com',
      phone: '+5511999990000',
    };

    it('Dado telefone E.164 e legado, Quando listar, Então formata o primeiro e sinaliza o segundo', async () => {
      mockFetch(buildRouter({ patients: [e164Fixture, legacyFixture] }));

      await renderPatientsPage();
      await screen.findByText('Eva Nova');

      expect(screen.getByText('(11) 99999-0000')).toBeInTheDocument();
      expect(screen.getByText('(11) 9999')).toBeInTheDocument();
      expect(screen.getAllByText('Corrigir telefone')).toHaveLength(1);
    });

    it('Dado telefone sem DDD, Quando salvar, Então mostra o motivo e não chama a API', async () => {
      mockFetch(buildRouter({ patients: [] }));
      await renderPatientsPage();
      await screen.findByText('Nenhum paciente cadastrado.');
      fireEvent.click(screen.getByText('+ Novo paciente'));
      fireEvent.change(screen.getByLabelText(/Nome completo/), {
        target: { value: 'Ana Lima' },
      });
      fireEvent.change(screen.getByLabelText(/Email \(opcional\)/), {
        target: { value: 'ana@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/Telefone \*/), {
        target: { value: '99999-0000' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      expect(await screen.findByText(/Informe o DDD/)).toBeInTheDocument();
      expect(mocks.createPatient).not.toHaveBeenCalled();
    });

    it('Dado paciente legado, Quando edita sem mexer no telefone, Então salva e a dica pede correção', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          patients: [legacyFixture],
          extra: ({ url, init }) =>
            url === `/api/patients/${legacyFixture.id}` &&
            init?.method === 'PUT'
              ? jsonResponse(legacyFixture)
              : undefined,
        }),
      );
      await renderPatientsPage();
      await screen.findByText('Lia Legado');

      fireEvent.click(screen.getByText('Editar'));
      expect(screen.getByText(/Telefone fora do padrão/)).toBeInTheDocument();
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(
          fetchMock.mock.calls.some(([, init]) => init?.method === 'PUT'),
        ).toBe(true);
      });
    });
  });

  describe('Cenário: CPF do paciente (#326)', () => {
    const fillRequired = () => {
      fireEvent.change(screen.getByLabelText(/Nome completo/), {
        target: { value: 'Ana Lima' },
      });
      fireEvent.change(screen.getByLabelText(/Email \(opcional\)/), {
        target: { value: 'ana@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/Telefone \*/), {
        target: { value: '11977776666' },
      });
    };

    it('Dado CPF com dígito verificador errado, Quando salvar, Então mostra a mensagem e não chama a API', async () => {
      mockFetch(buildRouter({ patients: [] }));
      await renderPatientsPage();
      await screen.findByText('Nenhum paciente cadastrado.');
      fireEvent.click(screen.getByText('+ Novo paciente'));
      fillRequired();
      fireEvent.change(screen.getByLabelText(/^CPF/), {
        target: { value: '529.982.247-24' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      expect(await screen.findByText(/CPF inválido/)).toBeInTheDocument();
      expect(mocks.createPatient).not.toHaveBeenCalled();
    });

    it('Dado CPF válido, Quando salvar, Então envia o CPF no cadastro', async () => {
      mockFetch(buildRouter({ patients: [] }));
      mocks.createPatient.mockResolvedValue(created('pat-4'));
      await renderPatientsPage();
      await screen.findByText('Nenhum paciente cadastrado.');
      fireEvent.click(screen.getByText('+ Novo paciente'));
      fillRequired();
      fireEvent.change(screen.getByLabelText(/^CPF/), {
        target: { value: '529.982.247-25' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(mocks.createPatient).toHaveBeenCalledWith(
          expect.objectContaining({ cpf: '529.982.247-25' }),
        );
      });
    });

    it('Dado paciente com CPF cadastrado, Quando edita sem digitar o CPF, Então a ficha mostra só a máscara e o CPF não vai no PUT', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          patients: [{ ...patientFixture, cpfMasked: '***.***.247-**' }],
          extra: ({ url, init }) =>
            url === `/api/patients/${patientFixture.id}` &&
            init?.method === 'PUT'
              ? jsonResponse(patientFixture)
              : undefined,
        }),
      );
      await renderPatientsPage();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Editar'));
      expect(screen.getByLabelText(/^CPF/)).toHaveValue('');
      expect(
        screen.getByText(/CPF cadastrado: \*\*\*\.\*\*\*\.247-\*\*/),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        const put = fetchMock.mock.calls.find(
          ([, init]) => init?.method === 'PUT',
        );
        expect(put).toBeDefined();
        expect(JSON.parse(String(put?.[1]?.body))).not.toHaveProperty('cpf');
      });
    });
  });

  describe('Cenário: criação via modal', () => {
    it('Dado clique em novo paciente e preenchimento, Quando submetido, Então cria o paciente e fecha o modal', async () => {
      mockFetch(buildRouter({ patients: [], partners: [partnerFixture] }));
      mocks.createPatient.mockResolvedValue(created('pat-3'));

      await renderPatientsPage();
      await screen.findByText('Nenhum paciente cadastrado.');

      fireEvent.click(screen.getByText('+ Novo paciente'));
      expect(screen.getByText('Novo paciente')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Nome completo/), {
        target: { value: 'Ana Lima' },
      });
      fireEvent.change(screen.getByLabelText(/Email \(opcional\)/), {
        target: { value: 'ana@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/Telefone \*/), {
        target: { value: '11977776666' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(mocks.createPatient).toHaveBeenCalledWith({
          fullName: 'Ana Lima',
          email: 'ana@example.com',
          phone: '11977776666',
          birthDate: null,
          notes: null,
          referredByPartnerId: null,
        });
      });
      await waitFor(() => {
        expect(screen.queryByText('Novo paciente')).not.toBeInTheDocument();
      });
      const toastText = await screen.findByText('Paciente criado');
      expect(toastText.closest('.sv-toast--success')).not.toBeNull();
    });

    it('Dado cadastro sem e-mail (#325), Quando submetido, Então envia email null', async () => {
      mockFetch(buildRouter({ patients: [], partners: [partnerFixture] }));
      mocks.createPatient.mockResolvedValue(created('pat-4'));

      await renderPatientsPage();
      await screen.findByText('Nenhum paciente cadastrado.');
      fireEvent.click(screen.getByText('+ Novo paciente'));
      fireEvent.change(screen.getByLabelText(/Nome completo/), {
        target: { value: 'Ana Lima' },
      });
      fireEvent.change(screen.getByLabelText(/Telefone \*/), {
        target: { value: '11977776666' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(mocks.createPatient).toHaveBeenCalledWith(
          expect.objectContaining({ email: null }),
        );
      });
    });
  });

  describe('Cenário: edição via modal', () => {
    it('Dado clique em editar paciente existente, Quando o modal abre, Então preenche os campos com os dados atuais', async () => {
      mockFetch(buildRouter({ patients: [patientFixture] }));

      await renderPatientsPage();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Editar'));

      expect(screen.getByText('Editar paciente')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Maria Souza')).toBeInTheDocument();
      expect(screen.getByDisplayValue('maria@example.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('11988887777')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1990-05-10')).toBeInTheDocument();
    });

    it('Dado edição submetida, Quando a chamada é bem-sucedida, Então envia PUT com os dados atualizados', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          patients: [patientFixture],
          extra: ({ url, init }) => {
            if (
              url === `/api/patients/${patientFixture.id}` &&
              init?.method === 'PUT'
            ) {
              return jsonResponse({
                ...patientFixture,
                fullName: 'Maria Souza Atualizada',
              });
            }
            return undefined;
          },
        }),
      );

      await renderPatientsPage();
      await screen.findByText('Maria Souza');
      fireEvent.click(screen.getByText('Editar'));

      fireEvent.change(screen.getByLabelText(/Nome completo/), {
        target: { value: 'Maria Souza Atualizada' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          `/api/patients/${patientFixture.id}`,
          expect.objectContaining({ method: 'PUT' }),
        );
      });
      const toastText = await screen.findByText('Paciente atualizado');
      expect(toastText.closest('.sv-toast--success')).not.toBeNull();
    });

    it('Dado erro ao salvar, Quando a chamada falha, Então exibe alerta no formulário e toast de erro', async () => {
      mockFetch(
        buildRouter({
          patients: [patientFixture],
          extra: ({ url, init }) => {
            if (
              url === `/api/patients/${patientFixture.id}` &&
              init?.method === 'PUT'
            ) {
              return errorResponse('Erro ao salvar paciente');
            }
            return undefined;
          },
        }),
      );

      await renderPatientsPage();
      await screen.findByText('Maria Souza');
      fireEvent.click(screen.getByText('Editar'));
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(
          screen.getAllByText('Erro ao salvar paciente').length,
        ).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Cenário: ativar/desativar', () => {
    it('Dado clique em desativar, Quando a chamada é bem-sucedida, Então recarrega a lista', async () => {
      let calls = 0;
      mockFetch(
        buildRouter({
          patients: [patientFixture],
          extra: ({ url, init }) => {
            if (
              url === `/api/patients/${patientFixture.id}` &&
              init?.method === 'PATCH'
            ) {
              return jsonResponse({ ...patientFixture, active: false });
            }
            if (
              url.startsWith('/api/patients') &&
              (init?.method ?? 'GET') === 'GET'
            ) {
              calls += 1;
            }
            return undefined;
          },
        }),
      );

      await renderPatientsPage();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      // A montagem não lê `/api` (a lista veio do servidor): a única leitura é a recarga.
      await waitFor(() => expect(calls).toBe(1));
      expect(
        await screen.findByText('Paciente desativado'),
      ).toBeInTheDocument();
    });

    it('Dado clique em desativar seguido de cancelamento no dialog, Quando acionado, Então não chama a API', async () => {
      let patchCalls = 0;
      mockFetch(
        buildRouter({
          patients: [patientFixture],
          extra: ({ url, init }) => {
            if (
              url === `/api/patients/${patientFixture.id}` &&
              init?.method === 'PATCH'
            ) {
              patchCalls += 1;
              return jsonResponse({ ...patientFixture, active: false });
            }
            return undefined;
          },
        }),
      );

      await renderPatientsPage();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Desativar'));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(patchCalls).toBe(0);
    });

    it('Dado erro ao alternar situação, Quando falha, Então exibe alerta de erro e toast de erro', async () => {
      mockFetch(
        buildRouter({
          patients: [patientFixture],
          extra: ({ url, init }) => {
            if (
              url === `/api/patients/${patientFixture.id}` &&
              init?.method === 'PATCH'
            ) {
              return errorResponse('Erro ao atualizar paciente');
            }
            return undefined;
          },
        }),
      );

      await renderPatientsPage();
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => {
        expect(
          screen.getAllByText('Erro ao atualizar paciente').length,
        ).toBeGreaterThanOrEqual(2);
      });
    });

    it('Dado paciente inativo, Quando renderizado, Então exibe ação de reativar', async () => {
      mockFetch(buildRouter({ patients: [inactivePatientFixture] }));

      await renderPatientsPage();

      expect(await screen.findByText('Reativar')).toBeInTheDocument();
    });

    it('Dado paciente anonimizado, Quando renderizado, Então não oferece reativar e explica o caminho', async () => {
      mockFetch(
        buildRouter({
          patients: [{ ...inactivePatientFixture, anonymized: true }],
        }),
      );

      await renderPatientsPage();

      expect(
        await screen.findByText(/Anonimizado: para voltar, cadastre/),
      ).toBeInTheDocument();
      expect(screen.queryByText('Reativar')).not.toBeInTheDocument();
    });
  });
});
