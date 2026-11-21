// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClinicInfoSection } from '@/app/(staff)/configuracoes/clinic-info-section';
import NewClinicPage from '@/app/plataforma/clinicas/nova/page';
import { renderWithToast } from '../support/render-with-toast';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/plataforma/clinicas/nova',
}));

const envelope = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data, error: null }),
});

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: false }), {
    target: { value },
  });

describe('Feature: Telas do cadastro da profissional autônoma (#977)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Dada a escolha de autônoma, Quando criar, Então pede CPF e COREN, some o CNPJ e o responsável técnico, e envia o tipo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        clinic: { id: 'pf-1', name: 'Jeiciele Silva' },
        admin: { email: 'j@x.test', delivered: false, inviteUrl: null },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithToast(<NewClinicPage />);

    fireEvent.click(
      screen.getByRole('radio', {
        name: 'Profissional autônoma (pessoa física)',
      }),
    );
    expect(screen.queryByLabelText('CNPJ', { exact: false })).toBeNull();
    expect(
      screen.queryByLabelText('Responsável técnico', { exact: false }),
    ).toBeNull();
    fill('Nome completo', 'Jeiciele Silva');
    fill('CPF', '529.982.247-25');
    fill('Telefone/WhatsApp de contato', '11 98888-7777');
    fill('E-mail de contato', 'contato@j.test');
    fill('Registro no conselho (COREN)', 'COREN-SP 123456');
    fill('E-mail do primeiro admin', 'j@x.test');
    fireEvent.click(
      screen.getByRole('button', { name: 'Criar clínica e convidar admin' }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      kind: 'individual',
      name: 'Jeiciele Silva',
      cnpj: null,
      cpf: '529.982.247-25',
      contactPhone: '11 98888-7777',
      contactEmail: 'contato@j.test',
      professionalName: '',
      professionalRegistry: 'COREN-SP 123456',
      adminEmail: 'j@x.test',
    });
  });

  it('Dada a volta para clínica, Quando escolher de novo, Então o CNPJ volta e o CPF some', () => {
    renderWithToast(<NewClinicPage />);

    fireEvent.click(
      screen.getByRole('radio', {
        name: 'Profissional autônoma (pessoa física)',
      }),
    );
    fireEvent.click(
      screen.getByRole('radio', { name: 'Clínica (pessoa jurídica)' }),
    );

    expect(screen.getByLabelText('CNPJ', { exact: false })).toBeInTheDocument();
    expect(screen.queryByLabelText('CPF', { exact: false })).toBeNull();
  });

  it('Dada autônoma em Configurações, Quando abrir os dados cadastrais, Então a tela fala de CPF e COREN, sem "clínica"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        envelope({
          info: {
            name: 'Jeiciele Silva',
            kind: 'individual',
            cpf: '52998224725',
            cnpj: null,
            address: null,
            city: null,
            professionalName: 'Jeiciele Silva',
            professionalRegistry: 'COREN-SP 123456',
            contactPhone: '11 98888-7777',
            contactEmail: 'contato@j.test',
            cnpjReviewSince: null,
            dpoName: null,
            dpoContact: null,
          },
        }),
      ),
    );
    renderWithToast(<ClinicInfoSection />);

    expect(
      await screen.findByRole('heading', { name: 'Dados cadastrais' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('CPF', { exact: false })).toHaveValue(
      '52998224725',
    );
    expect(screen.queryByLabelText('CNPJ', { exact: false })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Salvar dados cadastrais' }),
    ).toBeInTheDocument();
  });
});
