// @vitest-environment jsdom

import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import ConsentDocumentPage from '@/app/documentos/consentimento/[patientId]/page';
import type { PatientDto } from '@/lib/dto';

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

const CLINIC = {
  name: 'Clínica EstomaSysTech',
  cnpj: '12.345.678/0001-95',
  address: 'Rua das Flores, 100',
  city: 'São Paulo',
  professionalName: 'Enf. Ana',
  professionalRegistry: 'COREN-SP 123456',
};

const CONTROLLER = {
  name: 'Clínica EstomaSysTech',
  cnpj: '12.345.678/0001-95',
  address: 'Rua das Flores, 100, São Paulo',
  technicalLead: 'responsável técnico da clínica',
  dpoName: 'Responsável pela privacidade da clínica',
  dpoContact: 'privacidade@estomasystech.test',
};

const patient = (overrides: Partial<PatientDto>): PatientDto => ({
  id: 'pat-1',
  fullName: 'Davi Menor',
  email: null,
  phone: '11999999999',
  phoneNeedsCorrection: false,
  cpfMasked: null,
  birthDate: null,
  notes: null,
  active: true,
  anonymized: false,
  referredByPartnerId: null,
  guardianId: null,
  guardianPortalRevokedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const GUARDIAN = {
  id: 'g-1',
  fullName: 'Rita Representante',
  relationship: 'mae',
  relationshipLabel: 'Mãe',
  phone: '11988887777',
  email: null,
};

async function renderFor(data: PatientDto) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/api/documents/issue'))
        return ok({
          documentNumber: 'TEST-00000001',
          issuedAt: '2026-09-01T10:00:00.000Z',
        });
      if (url.includes('/api/clinic-info/legal-controller'))
        return ok(CONTROLLER);
      if (url.includes('/api/clinic-info')) return ok(CLINIC);
      return ok(data);
    }),
  );
  await act(async () => {
    renderWithToast(
      <ConsentDocumentPage params={Promise.resolve({ patientId: 'pat-1' })} />,
    );
  });
  await waitFor(() =>
    expect(
      screen.getByRole('heading', {
        name: 'Termo de Consentimento Livre e Esclarecido',
      }),
    ).toBeInTheDocument(),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const paragraphs = (pattern: RegExp) =>
  screen.queryAllByText(
    (_, element) =>
      element?.tagName === 'P' && pattern.test(element.textContent ?? ''),
  );

const yearsAgo = (years: number) =>
  new Date(Date.now() - years * 365.25 * 24 * 3600 * 1000).toISOString();

describe('Feature: termo impresso em nome de quem assina (#469)', () => {
  it('Dado menor com responsável, Quando abrir o termo, Então o representante legal assina o texto redigido em nome dele', async () => {
    await renderFor(
      patient({
        birthDate: yearsAgo(9),
        guardian: GUARDIAN,
        guardianId: 'g-1',
      }),
    );

    expect(
      paragraphs(
        /Eu, Rita Representante, Mãe e responsável legal de Davi Menor/,
      ),
    ).not.toHaveLength(0);
    expect(document.body.textContent).toContain(
      'ASSINADO PELO REPRESENTANTE LEGAL',
    );
    expect(screen.getAllByText(/v2-representante/).length).toBeGreaterThan(0);
  });

  it('Dado adulto com cuidador cadastrado, Quando abrir o termo, Então segue em primeira pessoa', async () => {
    await renderFor(
      patient({
        birthDate: yearsAgo(40),
        guardian: GUARDIAN,
        guardianId: 'g-1',
      }),
    );

    expect(paragraphs(/^Eu, Davi Menor/)).not.toHaveLength(0);
    expect(paragraphs(/responsável legal de/)).toHaveLength(0);
  });

  it('Dado clínica sem responsável técnico nomeado, Quando abrir o termo, Então a linha do responsável técnico não é impressa', async () => {
    await renderFor(patient({ birthDate: yearsAgo(40) }));

    expect(screen.queryByText(/Responsável técnico:/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/responsável técnico da clínica/),
    ).not.toBeInTheDocument();
  });
});
