// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkipLink } from '@/components/app-shell/skip-link';
import {
  staffDocumentTitle,
  useStaffDocumentTitle,
} from '@/components/app-shell/use-staff-document-title';

const pathname = { current: '/' };
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
}));

function Titulo() {
  useStaffDocumentTitle();
  return null;
}

afterEach(() => {
  cleanup();
  document.title = '';
});

describe('acessibilidade do shell da equipe', () => {
  it('Given a tela Agenda, When o shell monta, Then a aba diz "Agenda — EstomaSysTech"', () => {
    pathname.current = '/agenda';
    render(<Titulo />);
    expect(document.title).toBe('Agenda — EstomaSysTech');
  });

  it('Given uma subrota de paciente, When o shell monta, Then o título é o da seção', () => {
    pathname.current = '/pacientes/abc';
    expect(staffDocumentTitle(pathname.current)).toBe(
      'Pacientes — EstomaSysTech',
    );
  });

  it('Given um caminho fora das telas da equipe, When o shell monta, Then o título não muda', () => {
    pathname.current = '/outra-rota';
    document.title = 'Original';
    render(<Titulo />);
    expect(document.title).toBe('Original');
  });

  it('Given o link de salto, Then ele aponta para o conteúdo principal', () => {
    render(<SkipLink />);
    expect(
      screen.getByRole('link', { name: 'Pular para o conteúdo' }),
    ).toHaveAttribute('href', '#conteudo-principal');
  });
});
