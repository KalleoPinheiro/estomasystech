// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleaseVersion } from '@/components/release-version';
import type { SidebarIdentityDto } from '@/lib/dto';
import { StaffIdentityProvider, useStaffIdentity } from '@/lib/staff-access';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const identity: SidebarIdentityDto = {
  clinicLabel: 'Clínica Teste',
  account: {
    email: 'ana@clinica.com',
    role: 'atendente',
    roleLabel: 'Atendente',
    professionalId: null,
  },
};

function Probe() {
  const state = useStaffIdentity();
  return (
    <p data-testid="probe">
      {state?.role ?? 'sem-papel'}|{String(state?.loading)}|
      {state?.identity?.clinicLabel}
    </p>
  );
}

describe('Feature: casco da equipe sem chamada de API na carga (ADR-069)', () => {
  it('Dada a identidade lida no servidor, Quando o provider monta, Então o papel já está disponível e nenhuma requisição sai', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <StaffIdentityProvider initialIdentity={identity}>
        <Probe />
      </StaffIdentityProvider>,
    );

    expect(screen.getByTestId('probe')).toHaveTextContent(
      'atendente|false|Clínica Teste',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Dada a versão lida no servidor, Quando o rodapé monta, Então mostra a versão e não chama /api/version', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { container } = render(
      <ReleaseVersion
        initial={{ version: '0.4.0', releasedAt: null, sha: 'abc1234' }}
      />,
    );

    expect(container.querySelector('[data-app-version]')).toHaveTextContent(
      '0.4.0',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Dado que o servidor não achou versão (null), Quando o rodapé monta, Então cai na versão do build sem chamar /api/version', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    render(<ReleaseVersion initial={null} />);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
