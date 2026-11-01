// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/app-shell/bottom-nav';
import { StaffIdentityProvider } from '@/lib/staff-access';
import { identityFor } from '../support/staff-identity';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => cleanup());

describe('Feature: contador de triagem do casco sem limite (#559)', () => {
  it.each([9, 99, 100, 1234])(
    'Dada uma fila de %s fotos, Quando a barra monta, Então o selo mostra o número inteiro, sem «99+»',
    (count) => {
      render(
        <StaffIdentityProvider initialIdentity={identityFor('profissional')}>
          <BottomNav triageCount={count} />
        </StaffIdentityProvider>,
      );

      const badge = screen.getByLabelText(`${count} fotos para avaliar`);
      expect(badge).toHaveTextContent(String(count));
    },
  );
});
