// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickPatient } from '@/../tests/support/patient-picker';
import AuditPage from '@/app/(staff)/auditoria/page';
import { ValidationError } from '@/domain/shared/errors';
import type { AuditEventDto } from '@/lib/dto';
import { renderServerPage } from '../support/server-page';

const audit = vi.hoisted(() => ({
  listAuditEventsFor: vi.fn(),
  getPatientNameFor: vi.fn(),
  requireStaffPageFor: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: audit.replace }),
}));
vi.mock('@/lib/server/session', () => ({
  requireStaffPageFor: audit.requireStaffPageFor,
}));
vi.mock('@/lib/server/data/audit', () => ({
  listAuditEventsFor: audit.listAuditEventsFor,
  getPatientNameFor: audit.getPatientNameFor,
}));

const event = (overrides: Partial<AuditEventDto> = {}): AuditEventDto => ({
  id: 'e1',
  actorRole: 'professional',
  actorId: 'u1',
  action: 'read',
  resourceType: 'patient',
  resourceId: 'r1',
  patientId: 'p1',
  patientName: 'Maria Silva',
  detail: null,
  occurredAt: '2026-01-02T10:00:00.000Z',
  ...overrides,
});

/** A página que a camada de dados devolve (a tela é do servidor, #555). */
const mockAudit = (
  events: AuditEventDto[] | Error,
  nextCursor: string | null = null,
) => {
  audit.requireStaffPageFor.mockResolvedValue({
    role: 'company_admin',
    subject: 'admin@clinica.com',
    clinicId: 'c1',
  });
  audit.getPatientNameFor.mockResolvedValue('Maria Silva');
  audit.listAuditEventsFor.mockImplementation(async () => {
    if (events instanceof Error) throw events;
    return { events, nextCursor };
  });
};

const fetchSpy = vi.fn();
const renderPage = async (
  params: Record<string, string | string[] | undefined> = {},
) => {
  vi.stubGlobal('fetch', fetchSpy);
  return renderServerPage(() =>
    AuditPage({ searchParams: Promise.resolve(params) }),
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Feature: Auditoria no servidor, paginada e com filtros na URL (#521, #555)', () => {
  describe('Cenário: carregamento e listagem', () => {
    it('Dado eventos de auditoria, Quando a página carrega, Então lista eventos com rótulos traduzidos e 0 chamadas /api', async () => {
      mockAudit([
        event({
          actorRole: 'staff',
          action: 'update',
          resourceType: 'evolution',
          detail: 'Editou evolução',
          occurredAt: '2026-01-01T10:00:00.000Z',
        }),
      ]);

      await renderPage();

      expect(screen.getByText('Alteração')).toBeInTheDocument();
      expect(screen.getByText('Evolução')).toBeInTheDocument();
      expect(
        screen.getByRole('cell', { name: 'Maria Silva' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Editou evolução')).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('Dado nenhum evento, Quando a página carrega, Então exibe mensagem de vazio', async () => {
      mockAudit([]);
      await renderPage();
      expect(
        screen.getByText('Nenhum evento de auditoria registrado.'),
      ).toBeInTheDocument();
    });

    it('Dado erro ao carregar auditoria, Quando a página carrega, Então exibe alerta de erro', async () => {
      mockAudit(new ValidationError('Erro ao carregar'));
      await renderPage();
      expect(screen.getByRole('alert')).toHaveTextContent('Erro ao carregar');
    });

    it('Dado ação e recurso sem rótulo e paciente sem nome, Quando renderizar, Então exibe os valores brutos', async () => {
      mockAudit([
        event({
          id: 'e2',
          action: 'export' as AuditEventDto['action'],
          resourceType: 'unknown-resource',
          patientId: 'p2',
          patientName: null,
          detail: 'Detalhe do evento',
        }),
      ]);
      await renderPage();
      expect(screen.getByText('export')).toBeInTheDocument();
      expect(screen.getByText('unknown-resource')).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'p2' })).toBeInTheDocument();
    });

    it('Dado evento sem paciente e sem detalhe, Quando renderizar, Então exibe traço para paciente e detalhe', async () => {
      mockAudit([
        event({
          id: 'e3',
          resourceType: 'photo',
          patientId: null,
          patientName: null,
        }),
      ]);
      await renderPage();
      expect(screen.getAllByText('—')).toHaveLength(2);
    });

    it('Dado evento com horário conhecido, Então a coluna Quando inclui segundos', async () => {
      mockAudit([event({ occurredAt: '2026-01-01T10:00:45.000Z' })]);
      await renderPage();
      expect(screen.getByText(/:\d{2}:\d{2}$/)).toBeInTheDocument();
    });
  });

  describe('Cenário: paginação por cursor na URL (#521)', () => {
    it('Dado uma página cheia, Quando renderizar, Então pede 25 eventos e oferece «Próxima página» com o cursor', async () => {
      mockAudit([event()], 'cursor-1');
      await renderPage();

      expect(audit.listAuditEventsFor).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ cursor: undefined }),
      );
      expect(screen.getByText('1 evento nesta página')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Próxima página' }),
      ).toHaveAttribute('href', '/auditoria?cursor=cursor-1');
      expect(
        screen.queryByRole('link', { name: 'Voltar ao início' }),
      ).not.toBeInTheDocument();
    });

    it('Dado ?cursor= na URL, Quando a página carrega, Então a consulta parte do cursor e oferece «Voltar ao início»', async () => {
      mockAudit([event()]);
      await renderPage({ cursor: 'cursor-1', paciente: 'p1' });

      expect(audit.listAuditEventsFor).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ cursor: 'cursor-1', patientId: 'p1' }),
      );
      expect(screen.getByText('1 evento no fim da trilha')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Voltar ao início' }),
      ).toHaveAttribute('href', '/auditoria?paciente=p1');
      expect(
        screen.queryByRole('link', { name: 'Próxima página' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('Cenário: tamanho da página é um controle explícito (ADR-085)', () => {
    it('Dado nenhuma escolha, Quando a página carrega, Então pede 25 por página, em qualquer largura', async () => {
      mockAudit([event()]);
      await renderPage();

      expect(audit.listAuditEventsFor.mock.calls[0][1].limit).toBe(25);
      expect(screen.getByLabelText('Eventos por página')).toHaveValue('25');
    });

    it('Dado ?por=50, Quando a página carrega, Então pede 50 e a «Próxima página» mantém o tamanho', async () => {
      mockAudit([event()], 'cursor-1');
      await renderPage({ por: '50' });

      expect(audit.listAuditEventsFor.mock.calls[0][1].limit).toBe(50);
      expect(screen.getByLabelText('Eventos por página')).toHaveValue('50');
      expect(
        screen.getByRole('link', { name: 'Próxima página' }),
      ).toHaveAttribute('href', '/auditoria?por=50&cursor=cursor-1');
    });

    it('Dado ?por= inválido, Quando a página carrega, Então volta para 25', async () => {
      mockAudit([event()]);
      await renderPage({ por: '9999' });

      expect(audit.listAuditEventsFor.mock.calls[0][1].limit).toBe(25);
    });

    it('Dado o controle, Quando o usuário escolhe 50, Então a URL leva ?por=50 e volta à primeira página', async () => {
      mockAudit([event()]);
      await renderPage({ cursor: 'cursor-1' });

      fireEvent.change(screen.getByLabelText('Eventos por página'), {
        target: { value: '50' },
      });
      expect(audit.replace).toHaveBeenLastCalledWith('/auditoria?por=50');

      fireEvent.change(screen.getByLabelText('Eventos por página'), {
        target: { value: '25' },
      });
      expect(audit.replace).toHaveBeenLastCalledWith('/auditoria');
    });
  });

  describe('Cenário: filtros na URL', () => {
    it('Dado ?paciente=&de=&ate= na URL, Quando a página carrega, Então a consulta já usa o recorte do dia civil da clínica', async () => {
      mockAudit([event()]);
      await renderPage({ paciente: 'p1', de: '2026-01-01', ate: '2026-01-31' });

      const query = audit.listAuditEventsFor.mock.calls[0][1];
      expect(query.patientId).toBe('p1');
      expect(query.from).toBeInstanceOf(Date);
      expect(query.to).toBeInstanceOf(Date);
      expect(screen.getByLabelText('De')).toHaveValue('2026-01-01');
      expect(screen.getByLabelText('Até')).toHaveValue('2026-01-31');
      expect(audit.getPatientNameFor).toHaveBeenCalled();
      expect(
        screen.getByText('Maria Silva', {
          selector: '[data-patient-picker-selected]',
        }),
      ).toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('Dado datas inválidas na URL, Quando a página carrega, Então ignora o filtro em vez de quebrar', async () => {
      mockAudit([event()]);
      await renderPage({ de: 'abc', ate: '2026-13-45' });

      const query = audit.listAuditEventsFor.mock.calls[0][1];
      expect(query.from).toBeUndefined();
      expect(query.to).toBeUndefined();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('Dado alteração de período, Quando o usuário escolhe as datas, Então a URL passa a refletir os filtros e volta à primeira página', async () => {
      mockAudit([event()]);
      await renderPage({ cursor: 'cursor-1' });

      fireEvent.change(screen.getByLabelText('De'), {
        target: { value: '2026-01-01' },
      });
      expect(audit.replace).toHaveBeenLastCalledWith(
        '/auditoria?de=2026-01-01',
      );
    });

    it('Dado filtros preenchidos, Quando o usuário limpa a data, Então a URL volta ao recorte restante', async () => {
      mockAudit([event()]);
      await renderPage({ de: '2026-01-01' });

      fireEvent.change(screen.getByLabelText('De'), { target: { value: '' } });
      expect(audit.replace).toHaveBeenLastCalledWith('/auditoria');
    });

    it('Dado seleção de paciente no filtro, Quando alterado, Então a URL leva o paciente', async () => {
      mockAudit([]);
      fetchSpy.mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          data: [{ id: 'p1', fullName: 'Maria Silva', active: true }],
          error: null,
        }),
      }));
      await renderPage();

      await pickPatient('Maria Silva', 'Filtrar por paciente');

      await waitFor(() =>
        expect(audit.replace).toHaveBeenLastCalledWith(
          '/auditoria?paciente=p1',
        ),
      );
    });

    it('Dado o filtro de paciente, Então o campo tem rótulo acessível', async () => {
      mockAudit([]);
      await renderPage();
      expect(screen.getByLabelText('Filtrar por paciente')).toBeInTheDocument();
    });
  });
});
