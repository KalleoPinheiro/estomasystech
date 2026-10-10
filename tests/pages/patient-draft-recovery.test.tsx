// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { AnamnesisSection } from '@/app/(staff)/pacientes/[id]/anamnesis-section';
import { EvolutionsSection } from '@/app/(staff)/pacientes/[id]/evolutions-section';
import type { AnamnesisDto } from '@/lib/dto';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

/**
 * Issue #207: SOAP/anamnese que falham por sessão expirada (401) sobrevivem à
 * ida ao login — só nesta aba e só para a mesma conta.
 */

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));

vi.mock('@/lib/login-redirect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/login-redirect')>()),
  redirectToLoginOnExpiredSession: redirectMock,
}));

const RECOVERED =
  /Recuperamos o texto que não foi salvo quando sua sessão expirou/;

type Reply = { status: number; body: unknown };

const ok = (data: unknown): Reply => ({
  status: 200,
  body: { success: true, data, error: null },
});
const expired: Reply = {
  status: 401,
  body: { success: false, data: null, error: 'Não autenticado' },
};

let account = identityFor('profissional');
let saveReply: Reply = ok({});
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.sessionStorage.clear();
  account = identityFor('profissional');
  saveReply = ok({});
  redirectMock.mockReset().mockReturnValue(true);
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const reply =
      url === '/api/auth/identity'
        ? ok(account)
        : url === '/api/options/professionals'
          ? ok([])
          : init?.method
            ? saveReply
            : ok(null);
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderInStaff(ui: ReactElement) {
  await act(async () => {
    renderWithToast(<WithStaffIdentity>{ui}</WithStaffIdentity>);
  });
}

const evolutions = (patientId = 'pac-1') => (
  <EvolutionsSection
    patientId={patientId}
    evolutions={[]}
    error={null}
    isLoading={false}
    onSaved={() => {}}
    onRetry={() => {}}
    onDirtyChange={() => {}}
  />
);

const anamnesisFixture: AnamnesisDto = {
  patientId: 'pac-1',
  comorbidities: 'Diabetes tipo 2',
  allergies: '',
  medications: '',
  surgicalHistory: '',
  notes: '',
  updatedAt: '2026-01-05T10:00:00.000Z',
};

const anamnesis = (props: { isLoading?: boolean } = {}) => (
  <AnamnesisSection
    patientId="pac-1"
    anamnesis={anamnesisFixture}
    error={null}
    isLoading={props.isLoading ?? false}
    onSaved={() => {}}
    onRetry={() => {}}
    onDirtyChange={() => {}}
  />
);

async function typeSoapAndSubmit(text: string) {
  fireEvent.click(await screen.findByText('+ Nova evolução'));
  fireEvent.change(screen.getByLabelText(/S — Subjetivo/), {
    target: { value: text },
  });
  fireEvent.click(screen.getByText('Registrar evolução'));
}

describe('Feature: rascunho clínico sobrevive à sessão expirada (#207)', () => {
  describe('Cenário: SOAP', () => {
    it('Dado SOAP salvo com sessão expirada, Quando voltar do login com a mesma conta, Então o formulário reabre com o texto e o aviso', async () => {
      saveReply = expired;
      await renderInStaff(evolutions());
      await typeSoapAndSubmit('Dor 7/10, exsudato seroso');

      expect(
        await screen.findByText('Sua sessão expirou. Entre novamente.'),
      ).toBeInTheDocument();
      expect(redirectMock).toHaveBeenCalled();
      expect(window.sessionStorage.getItem('vitta:draft:soap:pac-1')).toContain(
        'Dor 7/10',
      );

      // Volta do login: nova montagem da tela.
      cleanup();
      saveReply = ok({});
      await renderInStaff(evolutions());

      expect(await screen.findByText(RECOVERED)).toBeInTheDocument();
      expect(screen.getByLabelText(/S — Subjetivo/)).toHaveValue(
        'Dor 7/10, exsudato seroso',
      );
      // Consumido na leitura: não reaparece numa terceira montagem.
      expect(window.sessionStorage.getItem('vitta:draft:soap:pac-1')).toBe(
        null,
      );

      fireEvent.click(screen.getByText('Registrar evolução'));
      await waitFor(() =>
        expect(screen.queryByText(RECOVERED)).not.toBeInTheDocument(),
      );
    });

    it('Dado rascunho de outra conta na mesma aba, Quando outra pessoa entrar, Então não vê o texto e o rascunho é apagado', async () => {
      saveReply = expired;
      await renderInStaff(evolutions());
      await typeSoapAndSubmit('Texto da colega');
      await screen.findByText('Sua sessão expirou. Entre novamente.');

      cleanup();
      account = identityFor('company_admin');
      await renderInStaff(evolutions());

      await waitFor(() =>
        expect(window.sessionStorage.getItem('vitta:draft:soap:pac-1')).toBe(
          null,
        ),
      );
      expect(screen.queryByText(RECOVERED)).not.toBeInTheDocument();
      expect(screen.queryByText('Registrar evolução')).not.toBeInTheDocument();
    });

    it('Dado falha que não é sessão expirada, Então nada é guardado', async () => {
      saveReply = {
        status: 500,
        body: { success: false, data: null, error: 'Falha interna' },
      };
      await renderInStaff(evolutions());
      await typeSoapAndSubmit('Texto qualquer');

      expect(await screen.findByText('Falha interna')).toBeInTheDocument();
      expect(window.sessionStorage.length).toBe(0);
    });

    it('Dado rascunho de outro paciente, Então não aparece nesta ficha', async () => {
      saveReply = expired;
      await renderInStaff(evolutions('pac-2'));
      await typeSoapAndSubmit('Do outro paciente');
      await screen.findByText('Sua sessão expirou. Entre novamente.');

      cleanup();
      await renderInStaff(evolutions('pac-1'));

      await screen.findByText('+ Nova evolução');
      expect(screen.queryByText(RECOVERED)).not.toBeInTheDocument();
      expect(
        window.sessionStorage.getItem('vitta:draft:soap:pac-2'),
      ).not.toBeNull();
    });
  });

  describe('Cenário: anamnese', () => {
    it('Dada anamnese salva com sessão expirada, Quando voltar, Então restaura só depois de carregar a anamnese', async () => {
      saveReply = expired;
      await renderInStaff(anamnesis());
      fireEvent.change(await screen.findByLabelText('Alergias'), {
        target: { value: 'Látex' },
      });
      fireEvent.click(screen.getByText('Salvar anamnese'));
      await screen.findByText('Sua sessão expirou. Entre novamente.');

      cleanup();
      saveReply = ok(anamnesisFixture);
      // Carregando: o rascunho espera (a seção remonta quando a anamnese chega).
      await renderInStaff(anamnesis({ isLoading: true }));
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/auth/identity',
          expect.anything(),
        ),
      );
      expect(
        window.sessionStorage.getItem('vitta:draft:anamnesis:pac-1'),
      ).not.toBeNull();

      cleanup();
      await renderInStaff(anamnesis());

      expect(await screen.findByText(RECOVERED)).toBeInTheDocument();
      expect(screen.getByLabelText('Alergias')).toHaveValue('Látex');
      expect(screen.getByLabelText('Comorbidades')).toHaveValue(
        'Diabetes tipo 2',
      );

      fireEvent.click(screen.getByText('Salvar anamnese'));
      await waitFor(() =>
        expect(screen.queryByText(RECOVERED)).not.toBeInTheDocument(),
      );
    });
  });

  describe('Cenário: storage indisponível', () => {
    it('Dado sessionStorage que lança, Então o formulário segue funcionando sem rascunho', async () => {
      const setItem = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('QuotaExceededError');
        });
      const getItem = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('SecurityError');
        });
      saveReply = expired;
      try {
        await renderInStaff(evolutions());
        await typeSoapAndSubmit('Texto');

        expect(
          await screen.findByText('Sua sessão expirou. Entre novamente.'),
        ).toBeInTheDocument();
        expect(screen.queryByText(RECOVERED)).not.toBeInTheDocument();
      } finally {
        setItem.mockRestore();
        getItem.mockRestore();
      }
    });
  });
});
