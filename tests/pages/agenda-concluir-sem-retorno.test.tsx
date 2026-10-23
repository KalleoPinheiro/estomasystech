// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { AppointmentDetail } from '@/app/(staff)/agenda/appointment-detail';
import type { AppointmentDto } from '@/lib/dto';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const consulta: AppointmentDto = {
  id: 'appt-1',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  endsAt: new Date(Date.now() + 86_400_000 + 3_600_000).toISOString(),
  procedure: 'Troca de bolsa',
  priceCents: 12000,
  notes: null,
  status: 'confirmed',
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
};

describe('Feature: concluir sem criar retorno por padrão (#480)', () => {
  it('Dado a consulta aberta, Quando concluir sem mexer no retorno, Então nenhum retorno é programado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true, data: {}, error: null }),
      })),
    );
    const onAction = vi.fn().mockResolvedValue(undefined);
    renderWithToast(
      <AppointmentDetail
        appointment={consulta}
        onAction={onAction}
        onReschedule={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/programar retorno/)).toHaveValue('0');
    fireEvent.click(screen.getByText('Concluir + faturar'));

    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith('complete', null),
    );
  });
});
