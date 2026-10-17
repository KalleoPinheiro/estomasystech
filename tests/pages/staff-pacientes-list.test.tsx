// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import PatientsPage from '@/app/(staff)/pacientes/page';
import type { PartnerDto, PatientDto } from '@/lib/dto';
import { formatDate } from '@/lib/format';

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
  birthDate: '1990-05-10T00:00:00.000Z',
  notes: null,
  referredByPartnerId: null,
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

function buildRouter({
  patients = [],
  partners = [],
  extra,
}: RouterOptions = {}) {
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

describe('Feature: PatientsPage', () => {
  describe('Cenário: listagem', () => {
    it('Dado nenhum paciente, Quando a página carrega, Então exibe mensagem de vazio', async () => {
      mockFetch(buildRouter({ patients: [] }));

      renderWithToast(<PatientsPage />);

      expect(
        await screen.findByText('Nenhum paciente cadastrado.'),
      ).toBeInTheDocument();
    });

    it('Dado pacientes cadastrados, Quando a página carrega, Então lista nome, contato, nascimento e situação', async () => {
      mockFetch(
        buildRouter({ patients: [patientFixture, inactivePatientFixture] }),
      );

      renderWithToast(<PatientsPage />);

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

      renderWithToast(<PatientsPage />);
      const row = (await screen.findByText('João Pereira')).closest('tr');

      expect(row).toHaveClass('bg-surface-2/60');
      expect(row).not.toHaveClass('opacity-50');
    });

    it("Dado a linha do paciente, Quando renderizar as ações, Então 'Prontuário' tem mais peso e as demais são Button ghost/sm (PRONT-11)", async () => {
      mockFetch(buildRouter({ patients: [patientFixture] }));

      renderWithToast(<PatientsPage />);
      await screen.findByText('Maria Souza');

      expect(screen.getByText('Prontuário')).toHaveClass('font-semibold');
      const editButton = screen.getByText('Editar');
      expect(editButton).toHaveClass('sv-btn--ghost', 'sv-btn--sm');
    });

    it('Dado busca sem resultado, Quando renderizar o vazio, Então a mensagem cita o termo buscado (PRONT-13)', async () => {
      const fetchMock = mockFetch(buildRouter({ patients: [] }));

      renderWithToast(<PatientsPage />);
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

      renderWithToast(<PatientsPage />);
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
      let callCount = 0;
      mockFetch(
        buildRouter({
          patients: [patientFixture],
          extra: ({ url, init }) => {
            const method = init?.method ?? 'GET';
            if (url.startsWith('/api/patients') && method === 'GET') {
              callCount += 1;
              // 1ª chamada (montagem) resolve normal; a 2ª (busca) nunca resolve —
              // só precisamos observar o estado "em voo", não o resultado final.
              if (callCount === 1) return undefined;
              return { ok: true, json: () => new Promise<never>(() => {}) };
            }
            return undefined;
          },
        }),
      );

      renderWithToast(<PatientsPage />);
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

  describe('Cenário: criação via modal', () => {
    it('Dado clique em novo paciente e preenchimento, Quando submetido, Então cria o paciente e fecha o modal', async () => {
      const fetchMock = mockFetch(
        buildRouter({
          patients: [],
          partners: [partnerFixture],
          extra: ({ url, init }) => {
            if (url === '/api/patients' && init?.method === 'POST') {
              return jsonResponse({ ...patientFixture, id: 'pat-3' });
            }
            return undefined;
          },
        }),
      );

      renderWithToast(<PatientsPage />);
      await screen.findByText('Nenhum paciente cadastrado.');

      fireEvent.click(screen.getByText('+ Novo paciente'));
      expect(screen.getByText('Novo paciente')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Nome completo/), {
        target: { value: 'Ana Lima' },
      });
      fireEvent.change(screen.getByLabelText(/Email \*/), {
        target: { value: 'ana@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/Telefone \*/), {
        target: { value: '11977776666' },
      });
      fireEvent.click(screen.getByText('Salvar'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/patients',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              fullName: 'Ana Lima',
              email: 'ana@example.com',
              phone: '11977776666',
              birthDate: null,
              notes: null,
              referredByPartnerId: null,
            }),
          }),
        );
      });
      await waitFor(() => {
        expect(screen.queryByText('Novo paciente')).not.toBeInTheDocument();
      });
      const toastText = await screen.findByText('Paciente criado');
      expect(toastText.closest('.sv-toast--success')).not.toBeNull();
    });
  });

  describe('Cenário: edição via modal', () => {
    it('Dado clique em editar paciente existente, Quando o modal abre, Então preenche os campos com os dados atuais', async () => {
      mockFetch(buildRouter({ patients: [patientFixture] }));

      renderWithToast(<PatientsPage />);
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

      renderWithToast(<PatientsPage />);
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

      renderWithToast(<PatientsPage />);
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

      renderWithToast(<PatientsPage />);
      await screen.findByText('Maria Souza');

      fireEvent.click(screen.getByText('Desativar'));
      fireEvent.click(await screen.findByText('Confirmar'));

      await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
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

      renderWithToast(<PatientsPage />);
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

      renderWithToast(<PatientsPage />);
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

      renderWithToast(<PatientsPage />);

      expect(await screen.findByText('Reativar')).toBeInTheDocument();
    });

    it('Dado paciente anonimizado, Quando renderizado, Então não oferece reativar e explica o caminho', async () => {
      mockFetch(
        buildRouter({
          patients: [{ ...inactivePatientFixture, anonymized: true }],
        }),
      );

      renderWithToast(<PatientsPage />);

      expect(
        await screen.findByText(/Anonimizado: para voltar, cadastre/),
      ).toBeInTheDocument();
      expect(screen.queryByText('Reativar')).not.toBeInTheDocument();
    });
  });
});
