// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ForgotPasswordForm } from '@/app/esqueci-senha/forgot-password-form';

const EMAIL = 'paciente@exemplo.com';
const PAGE = 'https://estomasystech.test/esqueci-senha';

afterEach(cleanup);

/** Linha de log de proxy: método e URL. GET levaria o e-mail na query. */
function accessLog(html: string): string {
  const tag = /<form\b[^>]*>/i.exec(html)?.[0] ?? '';
  const method = /\bmethod="([^"]+)"/i.exec(tag)?.[1] ?? 'get';
  const action = /\baction="([^"]*)"/i.exec(tag)?.[1];
  const url = new URL(action && action.length > 0 ? action : PAGE);
  if (method.toLowerCase() !== 'post') {
    url.searchParams.set('email', EMAIL);
  }
  return `${method.toUpperCase()} ${url.pathname}${url.search}`;
}

describe('Esqueci a senha antes da hidratação (#777)', () => {
  it('Dado o HTML do servidor, quando o envio é nativo, então o e-mail não vai para a URL nem para o log', () => {
    const html = renderToString(<ForgotPasswordForm />);
    const log = accessLog(html);

    expect(html).toMatch(/<form[^>]*method="post"/i);
    expect(html).toMatch(/<fieldset[^>]*disabled=""/i);
    expect(html).toMatch(/name="email"/);
    expect(log).toBe('POST /esqueci-senha');
    expect(log).not.toContain(EMAIL);
    expect(log).not.toContain('email=');
  });

  it('Dado o cliente hidratado, quando a pessoa digita, então o campo responde e o POST permanece', () => {
    render(<ForgotPasswordForm />);
    const field = screen.getByLabelText('E-mail');

    expect(field).toBeEnabled();
    expect(field).toHaveAttribute('name', 'email');
    fireEvent.change(field, { target: { value: EMAIL } });

    expect(field).toHaveValue(EMAIL);
    const form = field.closest('form');
    expect(form).toHaveAttribute('method', 'post');
    expect(form?.getAttribute('action') ?? '').not.toContain(EMAIL);
  });
});
