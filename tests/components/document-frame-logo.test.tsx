// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { type ClinicInfoDto, DocumentFrame } from '@/components/document-frame';
import { Clinic } from '@/domain/clinic/clinic';
import { toClinicInfoDto } from '@/lib/dto';

const base: ClinicInfoDto = {
  name: 'Clínica Aurora',
  cnpj: null,
  address: null,
  city: null,
  professionalName: null,
  professionalRegistry: null,
};

const frame = (clinic: ClinicInfoDto) =>
  render(
    <DocumentFrame
      clinic={clinic}
      title="Atestado"
      documentNumber="ATST-1"
      issuedAt="2026-09-03T14:30:00.000Z"
    >
      <p>Corpo</p>
    </DocumentFrame>,
  );

describe('Feature: Logo da clínica nos documentos impressos (#430)', () => {
  afterEach(cleanup);

  it('Dada clínica com logo, Quando montar o documento, Então a logo aparece no cabeçalho com o nome da clínica', () => {
    frame({ ...base, logoUrl: '/api/clinic/logo?v=logo-1-webp' });

    const logo = screen.getByRole('img', { name: 'Clínica Aurora' });
    expect(logo.getAttribute('src')).toContain('/api/clinic/logo');
  });

  it('Dada clínica sem logo, Quando montar o documento, Então o cabeçalho segue só com texto (sem iniciais no papel)', () => {
    frame(base);

    expect(screen.queryByRole('img')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Clínica Aurora' }),
    ).toBeInTheDocument();
  });

  it('Dada clínica com e sem chave de logo, Quando converter para o DTO, Então logoUrl só existe com logo', () => {
    const clinic = Clinic.restore({
      id: 'c1',
      name: 'Clínica Aurora',
      createdBy: 't',
      createdAt: new Date(),
    });

    expect(toClinicInfoDto(clinic)).not.toHaveProperty('logoUrl');
    expect(toClinicInfoDto(clinic.withLogoKey('logo-9-webp')).logoUrl).toBe(
      '/api/clinic/logo?v=logo-9-webp',
    );
  });
});
