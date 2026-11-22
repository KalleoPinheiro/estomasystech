// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { QuickRegistrationBanner } from '@/app/(staff)/pacientes/[id]/quick-registration-banner';
import type { PatientDto } from '@/lib/dto';

const patient = (registrationIncomplete?: boolean) =>
  ({ id: 'pac-1', registrationIncomplete }) as PatientDto;

/** #972: a ficha sinaliza cadastro rápido e consentimento pendente. */
describe('Aviso de cadastro rápido na ficha (#972)', () => {
  afterEach(cleanup);

  it('cadastro rápido → pede completar o cadastro e colher o termo', () => {
    render(<QuickRegistrationBanner patient={patient(true)} />);
    expect(
      document.querySelector('[data-registration-incomplete]'),
    ).toHaveTextContent(/Cadastro rápido: complete os dados/);
    expect(
      screen.getByRole('link', { name: 'termo de consentimento' }),
    ).toHaveAttribute('href', '/documentos/consentimento/pac-1');
  });

  it.each([false, undefined])('cadastro completo (%s) → sem aviso', (flag) => {
    const { container } = render(
      <QuickRegistrationBanner patient={patient(flag)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
