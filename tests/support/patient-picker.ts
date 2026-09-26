import { fireEvent, screen } from '@testing-library/react';

/**
 * Seleciona um paciente no `PatientPicker` (#197): digita o nome na busca e
 * clica no resultado. O mock de fetch do teste precisa responder a
 * `/api/patients?search=…` com o paciente.
 */
export async function pickPatient(
  name: string,
  label: RegExp | string = /Paciente/,
): Promise<void> {
  const input = await screen.findByLabelText(label);
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(
    await screen.findByRole('button', { name }, { timeout: 3000 }),
  );
}
