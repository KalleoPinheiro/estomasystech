// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SetPasswordPage from '@/app/definir-senha/page';

afterEach(cleanup);

describe('Feature: token do convite lido no servidor', () => {
  it('Dado token repetido na URL, Quando renderizar, Então usa o primeiro e mostra o formulário', async () => {
    render(
      await SetPasswordPage({
        searchParams: Promise.resolve({ token: ['a', 'b'] }),
      }),
    );
    expect(screen.getByLabelText('Nova senha')).toBeInTheDocument();
  });
});
