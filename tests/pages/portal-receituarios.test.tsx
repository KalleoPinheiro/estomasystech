// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MyPrescriptions } from '@/app/portal/prescriptions';

/** Receituários no portal do paciente (#956, ADR-116). */

afterEach(() => {
  cleanup();
});

describe('Feature: meus receituários no portal (#956, ADR-116)', () => {
  it('Dado receituário emitido, Quando abre o portal, Então mostra o link do PDF e a data', () => {
    render(
      <MyPrescriptions
        prescriptions={[
          {
            id: 'rct-1',
            documentNumber: 'RCT-AAAA1111',
            issuedAt: '2026-11-22T15:00:00.000Z',
          },
        ]}
      />,
    );

    const link = screen.getByRole('link', {
      name: 'Receituário RCT-AAAA1111 (PDF)',
    });
    expect(link.getAttribute('href')).toBe(
      '/api/portal/patient/receituarios/rct-1',
    );
    expect(screen.getByText('Meus receituários')).toBeTruthy();
    expect(screen.getByText('de 22/11/2026')).toBeTruthy();
  });

  it('Dado nenhum receituário, Quando abre o portal, Então a seção não aparece', () => {
    const { container } = render(<MyPrescriptions prescriptions={[]} />);

    expect(container.innerHTML).toBe('');
  });
});
