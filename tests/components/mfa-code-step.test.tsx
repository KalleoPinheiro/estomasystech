// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MfaCodeStep } from '@/app/login/mfa-steps';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('Feature: Foco automático na etapa do código de verificação (#719)', () => {
  afterEach(cleanup);

  it('Dado que a senha foi aceita, Quando a etapa do código abre, Então o campo do autenticador já está focado', () => {
    render(<MfaCodeStep pendingToken="token" onStep={vi.fn()} />);

    expect(screen.getByLabelText('Código do autenticador')).toHaveFocus();
  });

  it('Dado o campo do autenticador, Quando alterna para o código de recuperação, Então o novo campo recebe o foco', () => {
    render(<MfaCodeStep pendingToken="token" onStep={vi.fn()} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Usar um código de recuperação' }),
    );

    expect(screen.getByLabelText('Código de recuperação')).toHaveFocus();
  });
});
