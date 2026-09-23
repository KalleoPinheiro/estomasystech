// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import {
  ConditionProgress,
  type ConditionWithAssessmentsDto,
} from '@/app/portal/condition-progress';
import { ConsentCard, PatientPhotoUpload } from '@/app/portal/consent-card';
import PortalPage from '@/app/portal/page';
import { PartnerPortalView } from '@/app/portal/partner-view';
import { PatientPortalView } from '@/app/portal/patient-view';
import type {
  AssessmentDto,
  ConditionDto,
  ConditionPhotoDto,
  FollowUpDto,
  InvoiceDto,
  PartnerDto,
  PortalAppointmentDto,
  PortalPatientProfileDto,
  ReferredPatientSummaryDto,
} from '@/lib/dto';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';

function jsonResponse(
  success: boolean,
  data: unknown,
  error: string | null = null,
) {
  return {
    ok: success,
    json: async () => ({ success, data, error }),
  };
}

function rawResponse(ok: boolean, body: unknown = {}) {
  return { ok, json: async () => body };
}

interface RouteHandler {
  method?: string;
  path: string;
  respond: () => { ok: boolean; json: () => Promise<unknown> };
}

function mockFetch(routes: RouteHandler[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      const route = routes.find(
        (r) => url.startsWith(r.path) && (r.method ?? 'GET') === method,
      );
      if (!route) {
        throw new Error(`URL não mapeada no mock: ${method} ${url}`);
      }
      return route.respond();
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const patientFixture: PortalPatientProfileDto = {
  id: 'pat-1',
  fullName: 'Ana Souza',
  email: 'ana@paciente.com',
  phone: '11999990000',
};

const partnerFixture: PartnerDto = {
  id: 'partner-1',
  fullName: 'Dr. Carlos Lima',
  email: 'carlos@parceiro.com',
  phone: '11988880000',
  crm: 'CRM-SP 12345',
  specialty: 'Estomaterapia',
  active: true,
};

function buildAppointment(
  overrides: Partial<PortalAppointmentDto>,
): PortalAppointmentDto {
  return {
    id: 'appt-1',
    startsAt: '2099-01-01T10:00:00.000Z',
    endsAt: '2099-01-01T11:00:00.000Z',
    procedure: 'Troca de bolsa',
    status: 'scheduled',
    cancelledBy: null,
    ...overrides,
  };
}

function buildCondition(overrides: Partial<ConditionDto>): ConditionDto {
  return {
    id: 'cond-1',
    patientId: 'pat-1',
    kind: 'wound',
    title: 'Ferida perna E',
    stomaType: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    notes: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildAssessment(overrides: Partial<AssessmentDto>): AssessmentDto {
  return {
    id: 'assess-1',
    conditionId: 'cond-1',
    lengthMm: null,
    widthMm: null,
    depthMm: null,
    areaMm2: null,
    tissueType: null,
    exudate: null,
    painScale: null,
    skinCondition: null,
    complications: null,
    complicationCodes: [],
    detScore: null,
    pushScore: null,
    notes: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

const emptyPatientBundle = {
  patient: patientFixture,
  appointments: [] as PortalAppointmentDto[],
  conditions: [] as ConditionWithAssessmentsDto[],
  invoices: [] as InvoiceDto[],
  followUps: [] as FollowUpDto[],
};

describe('Feature: Página do portal', () => {
  describe('Cenário: carregando sessão', () => {
    it('Dado que a sessão ainda não chegou, Quando renderizar, Então exibe indicador de carregamento', () => {
      mockFetch([
        {
          path: '/api/portal/me',
          respond: () =>
            jsonResponse(true, { subject: 'x', role: 'company_admin' }),
        },
      ]);

      render(<PortalPage />);

      expect(screen.getByText('Carregando…')).toBeInTheDocument();
    });
  });

  // PORT-01/PORT-10 (#93): sem sessão válida, a tela não repete a mensagem
  // crua da API ("Não autenticado" etc.) — mostra estado dedicado com link
  // "Entrar", não um beco sem saída.
  describe('Cenário: erro ao carregar sessão', () => {
    it('Dado falha na API de sessão, Quando renderizar, Então mostra estado de sessão expirada com link de entrar', async () => {
      mockFetch([
        {
          path: '/api/portal/me',
          respond: () => jsonResponse(false, null, 'Não autenticado'),
        },
      ]);

      render(<PortalPage />);

      expect(await screen.findByText('Sua sessão expirou')).toBeInTheDocument();
      const link = screen.getByRole('link', { name: /Entrar/ });
      expect(link).toHaveAttribute('href', '/login?error=session_expired');
    });
  });

  describe('Cenário: sessão da equipe da clínica', () => {
    it('Dado role admin, Quando renderizar, Então exibe mensagem de equipe e link para o sistema', async () => {
      mockFetch([
        {
          path: '/api/portal/me',
          respond: () =>
            jsonResponse(true, {
              subject: 'ana@clinica.com',
              role: 'company_admin',
            }),
        },
      ]);

      render(<PortalPage />);

      expect(
        await screen.findByText(
          (_, el) =>
            el?.textContent ===
            'Você está logado como equipe da clínica (ana@clinica.com).',
        ),
      ).toBeInTheDocument();
      const link = screen.getByText('Ir para o sistema da clínica');
      expect(link.closest('a')).toHaveAttribute('href', '/');
    });

    it('Dado role admin, Então o bloco é um Card do Still Void, não uma div de superfície', async () => {
      mockFetch([
        {
          path: '/api/portal/me',
          respond: () =>
            jsonResponse(true, {
              subject: 'ana@clinica.com',
              role: 'company_admin',
            }),
        },
      ]);

      const { container } = render(<PortalPage />);
      await screen.findByText('Ir para o sistema da clínica');

      // SPEC_DEVIATION: na 3.x o <Card> do pacote emite a classe semântica
      // `sv-card` em vez do utilitário Tailwind `bg-sv-surface` da 2.x — mesma
      // mudança de implementação do Dialog/Button/Alert/Input (ver
      // tests/components/modal.test.tsx), não listada nas 3 quebras do Problem
      // Statement da spec.
      expect(container.querySelector('.sv-card')).toBeInTheDocument();
    });
  });

  describe('Cenário: sessão de paciente', () => {
    it('Dado role patient, Quando renderizar, Então exibe a visão do paciente', async () => {
      mockFetch([
        {
          path: '/api/portal/me',
          respond: () =>
            jsonResponse(true, { subject: 'pat-1', role: 'patient' }),
        },
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted: true,
              acceptedAt: null,
            }),
        },
        {
          path: '/api/portal/patient',
          respond: () => jsonResponse(true, emptyPatientBundle),
        },
      ]);

      renderWithToast(<PortalPage />);

      expect(
        await screen.findByRole('heading', { name: 'Olá, Ana!' }),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: sessão de parceiro', () => {
    it('Dado role partner, Quando renderizar, Então exibe a visão do parceiro', async () => {
      mockFetch([
        {
          path: '/api/portal/me',
          respond: () =>
            jsonResponse(true, { subject: 'partner-1', role: 'partner' }),
        },
        {
          path: '/api/portal/partner',
          respond: () =>
            jsonResponse(true, {
              partner: partnerFixture,
              referredPatients: [],
            }),
        },
      ]);

      render(<PortalPage />);

      expect(
        await screen.findByRole('heading', { name: 'Dr. Carlos Lima' }),
      ).toBeInTheDocument();
    });
  });
});

describe('Feature: Visão do paciente no portal', () => {
  describe('Cenário: carregando', () => {
    it('Dado que os dados ainda não chegaram, Quando renderizar, Então exibe indicador de carregamento', () => {
      mockFetch([
        {
          path: '/api/portal/patient',
          respond: () => jsonResponse(true, emptyPatientBundle),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      expect(screen.getByText('Carregando…')).toBeInTheDocument();
    });
  });

  describe('Cenário: erro ao carregar dados do paciente', () => {
    it('Dado falha na API, Quando renderizar, Então exibe alerta de erro', async () => {
      mockFetch([
        {
          path: '/api/portal/patient',
          respond: () => jsonResponse(false, null, 'Erro ao buscar paciente'),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      expect(
        await screen.findByText('Erro ao buscar paciente'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: sem consultas, condições, retornos ou faturas', () => {
    it('Dado paciente sem dados relacionados, Quando renderizar, Então exibe estados vazios em cada seção', async () => {
      mockFetch([
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted: true,
              acceptedAt: null,
            }),
        },
        {
          path: '/api/portal/patient',
          respond: () => jsonResponse(true, emptyPatientBundle),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      expect(
        await screen.findByText(
          'Nenhuma consulta agendada. Entre em contato com a clínica para agendar.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Retornos recomendados'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText('Nenhuma condição em acompanhamento.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Sem consultas anteriores.')).toBeInTheDocument();
      expect(screen.getByText('Nenhuma fatura.')).toBeInTheDocument();
    });
  });

  describe('Cenário: consulta futura pendente de confirmação', () => {
    it('Dado consulta agendada futura, Quando confirmar presença, Então chama a API e atualiza a lista', async () => {
      let status = 'scheduled';
      mockFetch([
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted: true,
              acceptedAt: null,
            }),
        },
        {
          method: 'POST',
          path: '/api/portal/patient/appointments/appt-1/confirm',
          respond: () => {
            status = 'confirmed';
            return jsonResponse(true, { ok: true });
          },
        },
        {
          path: '/api/portal/patient',
          respond: () =>
            jsonResponse(true, {
              ...emptyPatientBundle,
              appointments: [buildAppointment({ status })],
            }),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      const confirmButton = await screen.findByText('Confirmar presença');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(
          screen.queryByText('Confirmar presença'),
        ).not.toBeInTheDocument();
      });
      expect(screen.getByText('Confirmada')).toBeInTheDocument();
      expect(
        await screen.findByText('Presença confirmada'),
      ).toBeInTheDocument();
    });

    it('Dado falha ao confirmar presença, Quando confirmar, Então exibe alerta de erro e toast de erro', async () => {
      mockFetch([
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted: true,
              acceptedAt: null,
            }),
        },
        {
          method: 'POST',
          path: '/api/portal/patient/appointments/appt-1/confirm',
          respond: () => jsonResponse(false, null, 'Consulta já foi cancelada'),
        },
        {
          path: '/api/portal/patient',
          respond: () =>
            jsonResponse(true, {
              ...emptyPatientBundle,
              appointments: [buildAppointment({ status: 'scheduled' })],
            }),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      const confirmButton = await screen.findByText('Confirmar presença');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(
          screen.getAllByText('Consulta já foi cancelada').length,
        ).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // PORT-09 (#93): antes ficava enterrada em "Histórico", abaixo da evolução
  // clínica — agora aparece destacada logo no topo, não em "Próximas" nem em
  // "Histórico".
  describe('Cenário: consulta futura cancelada', () => {
    it('Dado consulta futura com status cancelado, Quando renderizar, Então aparece destacada, fora de Próximas e Histórico', async () => {
      mockFetch([
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted: true,
              acceptedAt: null,
            }),
        },
        {
          path: '/api/portal/patient',
          respond: () =>
            jsonResponse(true, {
              ...emptyPatientBundle,
              appointments: [
                buildAppointment({ id: 'appt-2', status: 'cancelled' }),
              ],
            }),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      expect(
        await screen.findByText('Uma consulta sua foi cancelada pela clínica:'),
      ).toBeInTheDocument();
      expect(screen.getByText(/Troca de bolsa/)).toBeInTheDocument();
      expect(
        screen.getByText(
          'Nenhuma consulta agendada. Entre em contato com a clínica para agendar.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Sem consultas anteriores.')).toBeInTheDocument();
    });
  });

  describe('Cenário: retornos recomendados', () => {
    it('Dado retornos pendentes, Quando renderizar, Então exibe o motivo e a data limite', async () => {
      const followUp: FollowUpDto = {
        id: 'fu-1',
        patientId: 'pat-1',
        appointmentId: null,
        dueDate: '2099-02-01T00:00:00.000Z',
        reason: 'Retorno para avaliação de ferida',
        status: 'pending',
      };
      mockFetch([
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted: true,
              acceptedAt: null,
            }),
        },
        {
          path: '/api/portal/patient',
          respond: () =>
            jsonResponse(true, {
              ...emptyPatientBundle,
              followUps: [followUp],
            }),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      expect(
        await screen.findByText('Retornos recomendados'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Retorno para avaliação de ferida/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(formatDate(followUp.dueDate)),
      ).toBeInTheDocument();
    });

    it('Dado retorno pendente, Quando escolher procedimento e horário, Então agenda e recarrega o portal (PORT4-10/11)', async () => {
      const followUp: FollowUpDto = {
        id: 'fu-1',
        patientId: 'pat-1',
        appointmentId: null,
        dueDate: '2099-02-01T00:00:00.000Z',
        reason: 'Retorno para avaliação de ferida',
        status: 'pending',
      };
      const scheduled: PortalAppointmentDto = {
        id: 'appt-novo',
        startsAt: '2099-03-02T12:00:00.000Z',
        endsAt: '2099-03-02T13:00:00.000Z',
        procedure: 'Curativo',
        status: 'scheduled',
        cancelledBy: null,
      };
      let scheduledYet = false;
      let postBody: string | null = null;
      // Após o POST, o portal recarregado devolve a consulta criada e nenhuma pendência.
      const bundleAfterScheduling = () =>
        jsonResponse(true, {
          ...emptyPatientBundle,
          followUps: scheduledYet ? [] : [followUp],
          appointments: scheduledYet ? [scheduled] : [],
        });
      mockFetch([
        {
          method: 'POST',
          path: '/api/portal/patient/appointments',
          respond: () => {
            scheduledYet = true;
            return jsonResponse(true, scheduled);
          },
        },
        {
          path: '/api/portal/patient/procedures',
          respond: () =>
            jsonResponse(true, [
              {
                id: 'proc-1',
                name: 'Curativo',
                priceCents: 15000,
                durationMinutes: 60,
                active: true,
              },
            ]),
        },
        {
          path: '/api/portal/patient/slots',
          respond: () =>
            jsonResponse(true, [
              {
                startsAt: '2099-03-02T12:00:00.000Z',
                endsAt: '2099-03-02T13:00:00.000Z',
              },
            ]),
        },
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted: true,
              acceptedAt: null,
            }),
        },
        { path: '/api/portal/patient', respond: bundleAfterScheduling },
      ]);
      // Captura do corpo enviado ao POST (o roteador acima não expõe o init).
      const rawFetch = globalThis.fetch as unknown as (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => Promise<unknown>;
      vi.stubGlobal(
        'fetch',
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (
            url.startsWith('/api/portal/patient/appointments') &&
            init?.method === 'POST'
          ) {
            postBody = init.body as string;
          }
          return rawFetch(input, init);
        },
      );

      renderWithToast(<PatientPortalView />);

      fireEvent.click(await screen.findByText('Agendar retorno'));
      fireEvent.change(await screen.findByLabelText(/Procedimento/), {
        target: { value: 'proc-1' },
      });
      fireEvent.change(screen.getByLabelText(/Dia/), {
        target: { value: '2099-03-02' },
      });

      // PORT-02 (#93): tocar o horário abre confirmação — só o "Confirmar" do
      // diálogo dispara o POST.
      fireEvent.click(await screen.findByText(formatTime(scheduled.startsAt)));
      fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));

      await waitFor(() => {
        expect(postBody).not.toBeNull();
      });
      expect(JSON.parse(postBody as unknown as string)).toEqual({
        procedureId: 'proc-1',
        startsAt: '2099-03-02T12:00:00.000Z',
        followUpId: 'fu-1',
      });
      // Portal recarregado: a consulta nova aparece e a pendência sai da lista.
      // Ancorado na data/hora da consulta — "Curativo" sozinho também casaria a
      // <option> do select de procedimento, passando sem a consulta renderizar.
      expect(
        await screen.findByText(formatDateTime(scheduled.startsAt)),
      ).toBeInTheDocument();
      expect(await screen.findByText('Retorno agendado')).toBeInTheDocument();
      await waitFor(() => {
        expect(
          screen.queryByText('Retornos recomendados'),
        ).not.toBeInTheDocument();
      });
    });

    it('Dado falha ao agendar, Quando confirmar horário, Então exibe a mensagem de erro', async () => {
      const followUp: FollowUpDto = {
        id: 'fu-1',
        patientId: 'pat-1',
        appointmentId: null,
        dueDate: '2099-02-01T00:00:00.000Z',
        reason: 'Retorno para avaliação de ferida',
        status: 'pending',
      };
      mockFetch([
        {
          method: 'POST',
          path: '/api/portal/patient/appointments',
          respond: () => jsonResponse(false, null, 'Horário indisponível'),
        },
        {
          path: '/api/portal/patient/procedures',
          respond: () =>
            jsonResponse(true, [
              {
                id: 'proc-1',
                name: 'Curativo',
                priceCents: 15000,
                durationMinutes: 60,
                active: true,
              },
            ]),
        },
        {
          path: '/api/portal/patient/slots',
          respond: () =>
            jsonResponse(true, [
              {
                startsAt: '2099-03-02T12:00:00.000Z',
                endsAt: '2099-03-02T13:00:00.000Z',
              },
            ]),
        },
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted: true,
              acceptedAt: null,
            }),
        },
        {
          path: '/api/portal/patient',
          respond: () =>
            jsonResponse(true, {
              ...emptyPatientBundle,
              followUps: [followUp],
            }),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      fireEvent.click(await screen.findByText('Agendar retorno'));
      fireEvent.change(await screen.findByLabelText(/Procedimento/), {
        target: { value: 'proc-1' },
      });
      fireEvent.click(
        await screen.findByText(formatTime('2099-03-02T12:00:00.000Z')),
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));

      expect(
        await screen.findByText('Horário indisponível'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: condições em acompanhamento', () => {
    it('Dado condição ativa, Quando renderizar, Então exibe o upload de foto; dado condição resolvida, não exibe', async () => {
      const activeCondition: ConditionWithAssessmentsDto = {
        condition: buildCondition({ id: 'cond-active', status: 'active' }),
        assessments: [],
      };
      const resolvedCondition: ConditionWithAssessmentsDto = {
        condition: buildCondition({
          id: 'cond-resolved',
          status: 'resolved',
          title: 'Estomia resolvida',
        }),
        assessments: [],
      };
      mockFetch([
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted: true,
              acceptedAt: null,
            }),
        },
        {
          path: '/api/portal/patient',
          respond: () =>
            jsonResponse(true, {
              ...emptyPatientBundle,
              conditions: [activeCondition, resolvedCondition],
            }),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      await screen.findByText('Ferida perna E');
      expect(screen.getByText('Estomia resolvida')).toBeInTheDocument();
      expect(screen.getAllByLabelText('Enviar foto')).toHaveLength(1);
      expect(screen.getByText('Em acompanhamento')).toBeInTheDocument();
      expect(screen.getByText('Resolvida')).toBeInTheDocument();
    });
  });

  describe('Cenário: aceite do termo libera o envio de foto na mesma tela', () => {
    it('Dado termo pendente, Quando aceitar, Então o envio de foto aparece sem recarregar a página', async () => {
      const activeCondition: ConditionWithAssessmentsDto = {
        condition: buildCondition({ id: 'cond-active', status: 'active' }),
        assessments: [],
      };
      let accepted = false;
      mockFetch([
        {
          method: 'POST',
          path: '/api/portal/patient/consent',
          respond: () => {
            accepted = true;
            return jsonResponse(true, { accepted: true });
          },
        },
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted,
              acceptedAt: accepted ? '2026-02-01T09:00:00.000Z' : null,
            }),
        },
        {
          path: '/api/portal/patient',
          respond: () =>
            jsonResponse(true, {
              ...emptyPatientBundle,
              conditions: [activeCondition],
            }),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      expect(
        await screen.findByText('Termo de consentimento pendente'),
      ).toBeInTheDocument();
      const warning = screen.getByRole('alert');
      expect(warning).toHaveTextContent(
        'Aceite o termo de consentimento acima para enviar fotos à equipe.',
      );
      expect(document.querySelector('input[type="file"]')).toBeNull();

      fireEvent.click(screen.getByText('Li e aceito o termo'));

      expect(
        await screen.findByText(
          `Termo de consentimento aceito em ${formatDateTime('2026-02-01T09:00:00.000Z')}.`,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(
          'Observação (opcional): dor, vazamento, vermelhidão…',
        ),
      ).toBeInTheDocument();
      expect(document.querySelector('input[type="file"]')).not.toBeNull();
      expect(
        screen.queryByText(
          'Aceite o termo de consentimento acima para enviar fotos à equipe.',
        ),
      ).not.toBeInTheDocument();
    });

    it('Dado que a recarga do termo falha após o aceite, Então o botão volta a ficar clicável (o aceite é retentável)', async () => {
      // Quem confirma o aceite na tela é o GET recarregado pelo pai. Se essa
      // recarga falhar, o card continua pendente — e o botão não pode ficar
      // preso em "Registrando…", senão o paciente perde o caminho de volta e o
      // envio de foto (COMP3-01) segue bloqueado para sempre.
      let consentReads = 0;
      mockFetch([
        {
          method: 'POST',
          path: '/api/portal/patient/consent',
          respond: () => jsonResponse(true, { accepted: true }),
        },
        {
          path: '/api/portal/patient/consent',
          respond: () => {
            consentReads += 1;
            return consentReads === 1
              ? jsonResponse(true, {
                  consentText: 'Termo',
                  accepted: false,
                  acceptedAt: null,
                })
              : jsonResponse(false, null, 'Falha ao recarregar o termo');
          },
        },
        {
          path: '/api/portal/patient',
          respond: () => jsonResponse(true, emptyPatientBundle),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      const button = await screen.findByText('Li e aceito o termo');
      fireEvent.click(button);

      await waitFor(() => expect(consentReads).toBe(2));
      await waitFor(() => {
        expect(screen.getByText('Li e aceito o termo')).toBeInTheDocument();
      });
      expect(
        screen.getByText('Li e aceito o termo').closest('button'),
      ).not.toBeDisabled();
      expect(screen.queryByText('Registrando…')).not.toBeInTheDocument();
    });

    it('Dado status do termo ainda não carregado, Quando renderizar, Então não bloqueia o envio por engano', async () => {
      const activeCondition: ConditionWithAssessmentsDto = {
        condition: buildCondition({ id: 'cond-active', status: 'active' }),
        assessments: [],
      };
      mockFetch([
        {
          path: '/api/portal/patient/consent',
          // Status indeterminado: a requisição nunca resolve dentro do teste.
          respond: () => ({
            ok: true,
            json: () => new Promise<unknown>(() => {}),
          }),
        },
        {
          path: '/api/portal/patient',
          respond: () =>
            jsonResponse(true, {
              ...emptyPatientBundle,
              conditions: [activeCondition],
            }),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      await screen.findByText('Ferida perna E');
      expect(
        screen.queryByText(
          'Aceite o termo de consentimento acima para enviar fotos à equipe.',
        ),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Enviar foto')).toBeInTheDocument();
    });
  });

  describe('Cenário: faturas do paciente', () => {
    it('Dado fatura pendente, Quando renderizar, Então exibe descrição, valor e status', async () => {
      const invoice: InvoiceDto = {
        id: 'inv-1',
        patientId: 'pat-1',
        appointmentId: null,
        description: 'Troca de bolsa de colostomia',
        amountCents: 15000,
        status: 'pending',
        issuedAt: '2026-01-05T00:00:00.000Z',
        dueDate: null,
        paidAt: null,
        paymentMethod: null,
      };
      mockFetch([
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted: true,
              acceptedAt: null,
            }),
        },
        {
          path: '/api/portal/patient',
          respond: () =>
            jsonResponse(true, { ...emptyPatientBundle, invoices: [invoice] }),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      expect(
        await screen.findByText('Troca de bolsa de colostomia'),
      ).toBeInTheDocument();
      expect(screen.getByText('R$ 150,00')).toBeInTheDocument();
      expect(screen.getByText('Pendente')).toBeInTheDocument();
    });
  });

  describe('Cenário: histórico de consultas passadas', () => {
    it('Dado consulta concluída no passado, Quando renderizar, Então aparece no histórico sem botão de confirmação', async () => {
      const pastAppointment = buildAppointment({
        id: 'appt-past',
        startsAt: '2000-01-01T10:00:00.000Z',
        endsAt: '2000-01-01T11:00:00.000Z',
        status: 'completed',
      });
      mockFetch([
        {
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(true, {
              consentText: 'Termo',
              accepted: true,
              acceptedAt: null,
            }),
        },
        {
          path: '/api/portal/patient',
          respond: () =>
            jsonResponse(true, {
              ...emptyPatientBundle,
              appointments: [pastAppointment],
            }),
        },
      ]);

      renderWithToast(<PatientPortalView />);

      expect(
        await screen.findByText(formatDateTime(pastAppointment.startsAt)),
      ).toBeInTheDocument();
      expect(screen.queryByText('Confirmar presença')).not.toBeInTheDocument();
      expect(screen.getByText('Concluída')).toBeInTheDocument();
    });
  });
});

describe('Feature: Visão do parceiro no portal', () => {
  describe('Cenário: carregando', () => {
    it('Dado que os dados ainda não chegaram, Quando renderizar, Então exibe indicador de carregamento', () => {
      mockFetch([
        {
          path: '/api/portal/partner',
          respond: () =>
            jsonResponse(true, {
              partner: partnerFixture,
              referredPatients: [],
            }),
        },
      ]);

      render(<PartnerPortalView />);

      expect(screen.getByText('Carregando…')).toBeInTheDocument();
    });
  });

  describe('Cenário: erro ao carregar dados', () => {
    it('Dado falha na API, Quando renderizar, Então exibe alerta de erro', async () => {
      mockFetch([
        {
          path: '/api/portal/partner',
          respond: () =>
            jsonResponse(false, null, 'Erro ao buscar dados do parceiro'),
        },
      ]);

      render(<PartnerPortalView />);

      expect(
        await screen.findByText('Erro ao buscar dados do parceiro'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: sem pacientes indicados', () => {
    it('Dado parceiro sem indicações, Quando renderizar, Então exibe estado vazio', async () => {
      mockFetch([
        {
          path: '/api/portal/partner',
          respond: () =>
            jsonResponse(true, {
              partner: partnerFixture,
              referredPatients: [],
            }),
        },
      ]);

      render(<PartnerPortalView />);

      expect(
        await screen.findByText(
          'Nenhum paciente indicado por você até o momento.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(/CRM-SP 12345/)).toBeInTheDocument();
      expect(screen.getByText(/Estomaterapia/)).toBeInTheDocument();
    });
  });

  describe('Cenário: pacientes indicados com evolução', () => {
    it('Dado paciente indicado, Quando expandir, Então exibe consultas e condições sem fotos', async () => {
      const referredPatient: ReferredPatientSummaryDto = {
        id: 'ref-pat-1',
        fullName: 'João Pereira',
      };
      const appointment = buildAppointment({ id: 'appt-ref-1' });
      const conditionEntry: ConditionWithAssessmentsDto = {
        condition: buildCondition({ id: 'cond-ref-1', title: 'Ferida sacral' }),
        assessments: [],
        photos: [
          {
            id: 'photo-1',
            conditionId: 'cond-ref-1',
            assessmentId: null,
            contentType: 'image/jpeg',
            sizeBytes: 1000,
            origin: 'patient',
            patientNote: null,
            triageStatus: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      };
      mockFetch([
        {
          path: '/api/portal/partner',
          respond: () =>
            jsonResponse(true, {
              partner: partnerFixture,
              referredPatients: [
                {
                  patient: referredPatient,
                  appointments: [appointment],
                  conditions: [conditionEntry],
                },
              ],
            }),
        },
      ]);

      render(<PartnerPortalView />);

      expect(await screen.findByText('João Pereira')).toBeInTheDocument();
      expect(
        screen.getByText('1 consulta(s) · 1 condição(ões) em acompanhamento'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByText('Ver evolução'));

      expect(screen.getByText('Ocultar')).toBeInTheDocument();
      expect(screen.getByText(/Troca de bolsa/)).toBeInTheDocument();
      expect(screen.getByText('Ferida sacral')).toBeInTheDocument();
      // Minimização LGPD: parceiro não recebe fotos, mesmo que a condição as tenha.
      expect(
        screen.queryByRole('img', { name: /Foto da condição/ }),
      ).not.toBeInTheDocument();
    });

    it('Dado paciente indicado sem consultas nem condições, Quando expandir, Então exibe estados vazios', async () => {
      const referredPatient: ReferredPatientSummaryDto = {
        id: 'ref-pat-2',
        fullName: 'Maria Alves',
      };
      mockFetch([
        {
          path: '/api/portal/partner',
          respond: () =>
            jsonResponse(true, {
              partner: partnerFixture,
              referredPatients: [
                { patient: referredPatient, appointments: [], conditions: [] },
              ],
            }),
        },
      ]);

      render(<PartnerPortalView />);

      fireEvent.click(await screen.findByText('Ver evolução'));

      expect(screen.getByText('Nenhuma consulta.')).toBeInTheDocument();
      expect(
        screen.getByText('Nenhuma condição registrada.'),
      ).toBeInTheDocument();
    });
  });
});

describe('Feature: Cartão de consentimento', () => {
  const TERMO = 'Texto do termo de consentimento';

  describe('Cenário: carregando', () => {
    it('Dado que o status ainda não chegou, Quando renderizar, Então não exibe nada', () => {
      renderWithToast(<ConsentCard status={null} onAccepted={vi.fn()} />);

      expect(screen.queryByText(TERMO)).not.toBeInTheDocument();
      expect(screen.queryByText('Li e aceito o termo')).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Termo de consentimento/),
      ).not.toBeInTheDocument();
    });
  });

  describe('Cenário: termo já aceito', () => {
    it('Dado consentimento aceito, Quando renderizar, Então exibe confirmação com data', () => {
      renderWithToast(
        <ConsentCard
          status={{
            consentText: TERMO,
            accepted: true,
            acceptedAt: '2026-01-10T14:30:00.000Z',
          }}
          onAccepted={vi.fn()}
        />,
      );

      const alert = screen.getByRole('status');
      expect(alert).toHaveTextContent(
        `Termo de consentimento aceito em ${formatDateTime('2026-01-10T14:30:00.000Z')}.`,
      );
    });
  });

  describe('Cenário: termo pendente de aceite', () => {
    it('Dado consentimento pendente, Quando aceitar, Então registra o aceite e avisa o pai', async () => {
      const onAccepted = vi.fn();
      mockFetch([
        {
          method: 'POST',
          path: '/api/portal/patient/consent',
          respond: () => jsonResponse(true, { accepted: true }),
        },
      ]);

      renderWithToast(
        <ConsentCard
          status={{ consentText: TERMO, accepted: false, acceptedAt: null }}
          onAccepted={onAccepted}
        />,
      );

      expect(
        screen.getByText('Termo de consentimento pendente'),
      ).toBeInTheDocument();
      expect(screen.getByText(TERMO)).toBeInTheDocument();

      fireEvent.click(screen.getByText('Li e aceito o termo'));

      await waitFor(() => {
        expect(onAccepted).toHaveBeenCalledTimes(1);
      });
      expect(
        await screen.findByText('Termo de consentimento aceito'),
      ).toBeInTheDocument();
    });

    it('Dado falha ao registrar aceite, Quando aceitar, Então exibe alerta de erro e toast de erro, e reabilita o botão', async () => {
      const onAccepted = vi.fn();
      mockFetch([
        {
          method: 'POST',
          path: '/api/portal/patient/consent',
          respond: () =>
            jsonResponse(false, null, 'Erro ao registrar aceite do termo'),
        },
      ]);

      renderWithToast(
        <ConsentCard
          status={{ consentText: TERMO, accepted: false, acceptedAt: null }}
          onAccepted={onAccepted}
        />,
      );

      fireEvent.click(screen.getByText('Li e aceito o termo'));

      await waitFor(() => {
        expect(
          screen.getAllByText('Erro ao registrar aceite do termo').length,
        ).toBeGreaterThanOrEqual(2);
      });
      const enabledButton = screen.getByText(
        'Li e aceito o termo',
      ) as HTMLButtonElement;
      expect(enabledButton.disabled).toBe(false);
      expect(onAccepted).not.toHaveBeenCalled();
    });
  });
});

describe('Feature: Envio de foto pelo paciente', () => {
  function makeFile(name = 'foto.png'): File {
    return new File(['conteudo'], name, { type: 'image/png' });
  }

  describe('Cenário: envio de foto com sucesso', () => {
    it('Dado arquivo selecionado com observação, Quando enviar, Então chama a API e notifica o pai', async () => {
      const onSent = vi.fn();
      let receivedBody: FormData | null = null;
      const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          receivedBody = init?.body as FormData;
          return rawResponse(true);
        },
      );
      vi.stubGlobal('fetch', fetchMock);

      renderWithToast(
        <PatientPhotoUpload
          conditionId="cond-1"
          consentPending={false}
          onSent={onSent}
        />,
      );

      fireEvent.change(
        screen.getByPlaceholderText(
          'Observação (opcional): dor, vazamento, vermelhidão…',
        ),
        {
          target: { value: 'Está coçando' },
        },
      );
      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      expect(input).toHaveAttribute(
        'accept',
        'image/jpeg,image/png,image/webp',
      );
      expect(input).not.toBeDisabled();

      fireEvent.change(input, { target: { files: [makeFile()] } });

      // PORT-06 (#93): escolher o arquivo só monta a prévia — não envia mais
      // no próprio onChange. Reseta o value do input (evita reenvio do mesmo
      // arquivo se o usuário selecionar de novo antes de confirmar).
      expect(input.value).toBe('');
      expect(
        await screen.findByAltText('Prévia da foto selecionada'),
      ).toBeInTheDocument();
      expect(onSent).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('Enviar'));

      await waitFor(() => {
        expect(onSent).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getAllByText(/Foto enviada/)).toHaveLength(2);
      });
      const toastText = screen
        .getAllByText(/Foto enviada/)
        .find((el) => el.className === 'sv-toast__description');
      expect(toastText?.closest('.sv-toast--success')).not.toBeNull();
      expect(receivedBody).not.toBeNull();
      expect((receivedBody as unknown as FormData).get('conditionId')).toBe(
        'cond-1',
      );
      expect((receivedBody as unknown as FormData).get('note')).toBe(
        'Está coçando',
      );
      await waitFor(() => expect(input).not.toBeDisabled());
    });
  });

  describe('Cenário: consentimento pendente', () => {
    it('Dado termo não aceito, Quando renderizar o envio, Então orienta o aceite e não oferece o arquivo (COMP3-01)', () => {
      renderWithToast(
        <PatientPhotoUpload
          conditionId="cond-1"
          consentPending
          onSent={vi.fn()}
        />,
      );

      expect(
        screen.getByText(
          'Aceite o termo de consentimento acima para enviar fotos à equipe.',
        ),
      ).toBeInTheDocument();
      expect(document.querySelector('input[type="file"]')).toBeNull();
    });
  });

  describe('Cenário: falha no envio de foto', () => {
    it('Dado erro retornado pela API, Quando enviar, Então exibe a mensagem de erro', async () => {
      const onSent = vi.fn();
      const fetchMock = vi.fn(async () =>
        rawResponse(false, { error: 'Arquivo muito grande' }),
      );
      vi.stubGlobal('fetch', fetchMock);

      renderWithToast(
        <PatientPhotoUpload
          conditionId="cond-1"
          consentPending={false}
          onSent={onSent}
        />,
      );

      const input = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [makeFile()] } });
      fireEvent.click(await screen.findByText('Enviar'));

      await waitFor(() => {
        expect(screen.getAllByText('Arquivo muito grande')).toHaveLength(2);
      });
      const toastText = screen
        .getAllByText('Arquivo muito grande')
        .find((el) => el.className === 'sv-toast__description');
      expect(toastText?.closest('.sv-toast--danger')).not.toBeNull();
      expect(onSent).not.toHaveBeenCalled();
    });
  });
});

describe('Feature: Evolução clínica da condição', () => {
  describe('Cenário: condição sem avaliações', () => {
    it('Dado nenhuma avaliação registrada, Quando renderizar, Então exibe mensagem informativa', () => {
      const entry: ConditionWithAssessmentsDto = {
        condition: buildCondition({}),
        assessments: [],
      };

      render(<ConditionProgress {...entry} />);

      expect(
        screen.getByText('Nenhuma avaliação registrada ainda.'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: condição de estomia com tipo definido', () => {
    it('Dado condição de estomia, Quando renderizar, Então exibe o rótulo do tipo de estomia', () => {
      const entry: ConditionWithAssessmentsDto = {
        condition: buildCondition({
          kind: 'stoma',
          stomaType: 'colostomia',
          title: 'Estomia abdominal',
        }),
        assessments: [],
      };

      render(<ConditionProgress {...entry} />);

      expect(screen.getByText('Estomia abdominal')).toBeInTheDocument();
      expect(screen.getByText('Estomia · Colostomia')).toBeInTheDocument();
    });
  });

  describe('Cenário: avaliação única (sem pontos suficientes para o gráfico)', () => {
    it('Dado uma única avaliação com área medida, Quando renderizar, Então exibe orientação em vez do gráfico', () => {
      const entry: ConditionWithAssessmentsDto = {
        condition: buildCondition({}),
        assessments: [buildAssessment({ areaMm2: 50 })],
      };

      render(<ConditionProgress {...entry} />);

      expect(
        screen.getByText(
          'Registre medidas (C×L) ou dor em pelo menos duas avaliações para acompanhar a tendência.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('img', { name: 'Gráfico de evolução da condição' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Cenário: duas avaliações com área medida', () => {
    it('Dado duas avaliações com área, Quando renderizar, Então exibe o gráfico de evolução', () => {
      const entry: ConditionWithAssessmentsDto = {
        condition: buildCondition({}),
        assessments: [
          buildAssessment({
            id: 'a1',
            areaMm2: 80,
            createdAt: '2026-01-01T00:00:00.000Z',
          }),
          buildAssessment({
            id: 'a2',
            areaMm2: 40,
            createdAt: '2026-01-10T00:00:00.000Z',
          }),
        ],
      };

      render(<ConditionProgress {...entry} />);

      expect(
        screen.getByRole('img', { name: 'Gráfico de evolução da condição' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Área reduziu 50% desde a primeira medição/),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: descrição completa de uma avaliação', () => {
    it('Dado avaliação com todos os campos, Quando renderizar, Então exibe a descrição combinada, sem complicações/notas (PORT-03, #93)', () => {
      const assessment = buildAssessment({
        lengthMm: 10,
        widthMm: 5,
        areaMm2: 50,
        tissueType: 'granulação',
        exudate: 'moderate',
        painScale: 3,
        skinCondition: 'íntegra',
        // Presentes no DTO staff (AssessmentDto) mas NUNCA chegam ao portal —
        // `PortalAssessmentDto` (o que a API do portal de fato retorna) não
        // tem esses campos; texto livre interno não é pra leitura do paciente.
        complications: 'nenhuma',
        notes: 'observação extra',
      });
      const entry: ConditionWithAssessmentsDto = {
        condition: buildCondition({}),
        assessments: [assessment],
      };

      render(<ConditionProgress {...entry} />);

      expect(
        screen.getByText(
          'ferida 10×5mm (área 50mm²) · tecido: granulação · exsudato: Moderado · dor 3/10 · pele periestomal: íntegra',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/complicações/)).not.toBeInTheDocument();
      expect(screen.queryByText(/observação extra/)).not.toBeInTheDocument();
    });

    it('Dado avaliação sem nenhum campo preenchido, Quando renderizar, Então exibe o texto padrão', () => {
      const entry: ConditionWithAssessmentsDto = {
        condition: buildCondition({}),
        assessments: [buildAssessment({})],
      };

      render(<ConditionProgress {...entry} />);

      expect(screen.getByText('Avaliação registrada')).toBeInTheDocument();
    });
  });

  describe('Cenário: galeria de fotos', () => {
    it('Dado fotos e base de URL autorizada, Quando renderizar, Então exibe as imagens', () => {
      const photo: ConditionPhotoDto = {
        id: 'photo-1',
        conditionId: 'cond-1',
        assessmentId: null,
        contentType: 'image/jpeg',
        sizeBytes: 2000,
        origin: 'patient',
        patientNote: null,
        triageStatus: null,
        createdAt: '2026-03-01T00:00:00.000Z',
      };
      const entry: ConditionWithAssessmentsDto = {
        condition: buildCondition({}),
        assessments: [],
        photos: [photo],
        photoUrlBase: '/api/portal/patient/photos',
      };

      render(<ConditionProgress {...entry} />);

      const image = screen.getByAltText(
        `Foto da condição em ${formatDate(photo.createdAt)}`,
      ) as HTMLImageElement;
      expect(image.src).toContain(
        '%2Fapi%2Fportal%2Fpatient%2Fphotos%2Fphoto-1',
      );
    });

    it('Dado fotos sem base de URL autorizada, Quando renderizar, Então não exibe a galeria', () => {
      const photo: ConditionPhotoDto = {
        id: 'photo-1',
        conditionId: 'cond-1',
        assessmentId: null,
        contentType: 'image/jpeg',
        sizeBytes: 2000,
        origin: 'patient',
        patientNote: null,
        triageStatus: null,
        createdAt: '2026-03-01T00:00:00.000Z',
      };
      const entry: ConditionWithAssessmentsDto = {
        condition: buildCondition({}),
        assessments: [],
        photos: [photo],
      };

      render(<ConditionProgress {...entry} />);

      expect(screen.queryByAltText(/Foto da condição/)).not.toBeInTheDocument();
    });
  });
});
