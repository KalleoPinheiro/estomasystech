// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuditPage from '@/app/(staff)/auditoria/page';

let currentSearch = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

const event = {
  id: 'e1',
  actorRole: 'professional',
  actorId: 'u1',
  action: 'read',
  resourceType: 'patient',
  patientId: 'p1',
  patientName: 'Maria Silva',
  detail: null,
  occurredAt: '2026-01-02T10:00:00.000Z',
};

const stubViewport = (mobile: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: mobile && query.includes('max-width: 767px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
};

const stubFetch = () => {
  const fn = vi.fn(async (_url: string) => ({
    ok: true,
    json: async () => ({
      success: true,
      data: [event],
      error: null,
      meta: { nextCursor: null },
    }),
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
  currentSearch = '';
  window.history.replaceState(null, '', '/');
});

describe('Feature: Auditoria no celular (#521)', () => {
  describe('Cenário: lista de cartões em telas estreitas', () => {
    it('Dado viewport < 768px, Quando a página carrega, Então lista cartões em vez de tabela e pede 25 por página', async () => {
      stubViewport(true);
      const fetchMock = stubFetch();

      render(<AuditPage />);

      expect(await screen.findByText('Leitura')).toBeInTheDocument();
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(([url]) =>
            String(url).includes('limit=25'),
          ),
        ).toBe(true),
      );
    });
  });

  describe('Cenário: tabela no desktop', () => {
    it('Dado viewport largo, Quando a página carrega, Então mostra a tabela e pede 50 por página', async () => {
      stubViewport(false);
      const fetchMock = stubFetch();

      render(<AuditPage />);

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes('limit=50')),
      ).toBe(true);
      expect(await screen.findByText('1 evento no total')).toBeInTheDocument();
    });
  });

  describe('Cenário: filtros na URL', () => {
    it('Dado ?paciente=&de=&ate= na URL, Quando a página carrega, Então a busca já usa o recorte', async () => {
      stubViewport(false);
      currentSearch = 'paciente=p1&de=2026-01-01&ate=2026-01-31';
      const fetchMock = stubFetch();

      render(<AuditPage />);

      await screen.findByRole('table');
      const url = String(
        fetchMock.mock.calls
          .map(([u]) => String(u))
          .find((u) => u.startsWith('/api/audit')),
      );
      expect(url).toContain('patientId=p1');
      expect(url).toContain('from=');
      expect(url).toContain('to=');
    });

    it('Dado alteração de período, Quando o usuário escolhe as datas, Então a URL passa a refletir os filtros', async () => {
      stubViewport(false);
      stubFetch();

      render(<AuditPage />);
      await screen.findByRole('table');

      fireEvent.change(screen.getByLabelText('De'), {
        target: { value: '2026-01-01' },
      });
      fireEvent.change(screen.getByLabelText('Até'), {
        target: { value: '2026-01-31' },
      });

      expect(window.location.search).toBe('?de=2026-01-01&ate=2026-01-31');
      fireEvent.change(screen.getByLabelText('De'), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText('Até'), { target: { value: '' } });
      expect(window.location.search).toBe('');
    });
  });
});
