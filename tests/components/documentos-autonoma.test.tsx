// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClinicInfoIncompleteAlert } from '@/components/clinic-info-incomplete-alert';
import { type ClinicInfoDto, DocumentFrame } from '@/components/document-frame';
import { Clinic } from '@/domain/clinic/clinic';
import { toClinicInfoDto, toPlatformClinicSummaryDto } from '@/lib/dto';

const individual: ClinicInfoDto = {
  name: 'Jeiciele Silva',
  kind: 'individual',
  cpf: '52998224725',
  cnpj: null,
  address: 'Rua A, 1',
  city: 'Santos/SP',
  professionalName: 'Jeiciele Silva',
  professionalRegistry: 'COREN-SP 123456',
};

const frame = (clinic: ClinicInfoDto) =>
  render(
    <DocumentFrame
      clinic={clinic}
      title="Atestado"
      documentNumber="ATST-1"
      issuedAt="2026-11-20T14:30:00.000Z"
    >
      <p>Corpo</p>
    </DocumentFrame>,
  );

describe('Feature: Documentos da profissional autônoma (#977)', () => {
  afterEach(cleanup);

  it('Dada autônoma, Quando montar o documento, Então o timbre traz nome, CPF formatado e COREN, sem CNPJ', () => {
    frame(individual);

    const header = screen.getByRole('banner');
    expect(header.textContent).toContain('CPF: 529.982.247-25');
    expect(header.textContent).toContain('COREN-SP 123456');
    expect(header.textContent).not.toContain('CNPJ');
  });

  it('Dada clínica, Quando montar o documento, Então o timbre segue com o CNPJ e sem o registro', () => {
    frame({
      ...individual,
      kind: undefined,
      cpf: undefined,
      cnpj: '12.345.678/0001-95',
    });

    const header = screen.getByRole('banner');
    expect(header.textContent).toContain('CNPJ: 12.345.678/0001-95');
    expect(header.textContent).not.toContain('COREN');
  });

  it('Dada autônoma sem CPF, Quando bloquear o documento, Então o aviso fala em CPF e conselho, não em clínica', () => {
    render(<ClinicInfoIncompleteAlert clinic={{ ...individual, cpf: null }} />);

    expect(
      screen.getByText(/Cadastro sem CPF ou registro no conselho/),
    ).toBeInTheDocument();
    expect(screen.getByText(/falta: CPF/)).toBeInTheDocument();
  });

  it('Dadas autônoma e clínica, Quando converter para o DTO, Então só a autônoma leva tipo e CPF', () => {
    const autonoma = Clinic.restore({
      id: 'c-1',
      name: 'Jeiciele Silva',
      kind: 'individual',
      cpf: '52998224725',
      createdBy: 'x',
      createdAt: new Date(),
    });
    const clinica = Clinic.restore({
      id: 'c-2',
      name: 'Aurora',
      createdBy: 'x',
      createdAt: new Date(),
    });

    expect(toClinicInfoDto(autonoma)).toMatchObject({
      kind: 'individual',
      cpf: '52998224725',
    });
    expect(toClinicInfoDto(clinica)).not.toHaveProperty('kind');
    expect(toClinicInfoDto(clinica)).not.toHaveProperty('cpf');
  });

  it('Dada autônoma sem CPF gravado, Quando listar na plataforma, Então o CPF mascarado vem vazio', () => {
    const semCpf = Clinic.restore({
      id: 'c-3',
      name: 'Jeiciele Silva',
      kind: 'individual',
      createdBy: 'x',
      createdAt: new Date(),
    });

    expect(toPlatformClinicSummaryDto(semCpf, 'none', null)).toMatchObject({
      kind: 'individual',
      cpfMasked: null,
    });
  });
});
