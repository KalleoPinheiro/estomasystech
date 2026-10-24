// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PatientForm } from '@/app/(staff)/pacientes/patient-form';

afterEach(cleanup);

function preencher(phone: string, cpf: string) {
  fireEvent.change(screen.getByLabelText(/Nome completo/), {
    target: { value: 'Al' },
  });
  fireEvent.change(screen.getByLabelText(/Telefone/), {
    target: { value: phone },
  });
  fireEvent.change(screen.getByLabelText(/CPF/), { target: { value: cpf } });
  fireEvent.submit(screen.getByRole('button', { name: 'Salvar' }));
}

describe('Feature: erros do formulário de paciente (#478)', () => {
  it('Dado telefone e CPF inválidos, Quando salvar, Então lista os dois erros e marca os dois campos', () => {
    const onSubmit = vi.fn();
    render(<PatientForm partners={[]} onSubmit={onSubmit} />);

    preencher('12345', '11111111111');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Telefone/i);
    expect(alert).toHaveTextContent(/CPF/i);
    expect(screen.getByLabelText(/Telefone/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(/CPF/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Dado só o CPF inválido, Quando salvar, Então só o CPF é marcado', () => {
    render(<PatientForm partners={[]} onSubmit={vi.fn()} />);

    preencher('(11) 98954-1898', '11111111111');

    expect(screen.getByLabelText(/CPF/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(/Telefone/)).not.toHaveAttribute(
      'aria-invalid',
    );
  });
});
