'use client';

import type { ComponentProps } from 'react';
import { useHydrated } from '@/components/app-shell/use-hydrated';

type SafeFormProps = Omit<ComponentProps<'form'>, 'method'>;

/**
 * Formulário da aplicação. Todo `<form>` de `src/` passa por aqui (regra em
 * `tests/architecture/form-method.test.ts`, #777).
 *
 * Antes da hidratação o formulário não é do React: sem `method`, o envio nativo
 * é um GET com os campos na URL (log de proxy, histórico do navegador) e o que se
 * digita some quando o React assume. Por isso o `method` é sempre `post` (o corpo
 * não aparece no endereço) e os campos ficam desabilitados, num `<fieldset>`
 * invisível, até a hidratação terminar.
 */
export function SafeForm({ children, ...props }: SafeFormProps) {
  const hydrated = useHydrated();

  return (
    <form {...props} method="post">
      <fieldset disabled={!hydrated} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
