// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginCard } from '@/app/login/login-card';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const card = <LoginCard passwordEnabled errorMessage={null} destination="/" />;

afterEach(cleanup);

// #679: o login digitado antes da hidratação se perdia ou virava um GET com a senha na URL.
describe('login antes e depois da hidratação (#679)', () => {
  it('Dado o HTML do servidor, quando a página chega, então e-mail e senha só leem e «Entrar» espera', () => {
    const html = renderToString(card);

    expect(html).toMatch(
      /<input[^>]*type="email"[^>]*readOnly=""|<input[^>]*readonly=""[^>]*type="email"/i,
    );
    expect(html).toMatch(
      /<input[^>]*type="password"[^>]*readOnly=""|<input[^>]*readonly=""[^>]*type="password"/i,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Entrar<\/button>/i);
  });

  it('Dado o cliente já hidratado, quando a pessoa digita, então os campos aceitam texto e «Entrar» responde', () => {
    render(card);

    expect(screen.getByLabelText('Email')).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('Senha')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('Dado o HTML do servidor, quando o envio nativo acontece sem JavaScript, então o formulário usa POST e a senha não vai para a URL', () => {
    expect(renderToString(card)).toMatch(/<form[^>]*method="post"/i);
  });
});
