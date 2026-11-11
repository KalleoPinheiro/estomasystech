// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { SafeForm } from '@/components/safe-form';

afterEach(cleanup);

const form = (
  <SafeForm aria-label="Esqueci a senha" className="flex">
    <input name="email" />
    <button type="submit">Enviar</button>
  </SafeForm>
);

// #777: o formulário enviado antes da hidratação virava um GET com os dados na URL.
describe('SafeForm (#777)', () => {
  it('Dado o HTML do servidor, quando o envio nativo acontece sem JavaScript, então o formulário usa POST e nada vai para a URL', () => {
    expect(renderToString(form)).toMatch(/<form[^>]*method="post"/i);
  });

  it('Dado o HTML do servidor, quando a página chega, então os campos e o botão esperam a hidratação', () => {
    expect(renderToString(form)).toMatch(/<fieldset[^>]*disabled=""/i);
  });

  it('Dado o cliente já hidratado, quando a pessoa digita, então os campos respondem e o formulário segue em POST', () => {
    render(form);

    expect(screen.getByRole('form')).toHaveAttribute('method', 'post');
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  });

  it('Dado um method vindo de fora, quando renderiza, então o POST prevalece', () => {
    const html = renderToString(
      // @ts-expect-error method é omitido do tipo de propósito
      <SafeForm method="get">
        <input name="q" />
      </SafeForm>,
    );

    expect(html).toMatch(/method="post"/i);
    expect(html).not.toMatch(/method="get"/i);
  });
});
