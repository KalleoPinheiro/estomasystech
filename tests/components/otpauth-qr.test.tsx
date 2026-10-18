// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import QRCode from 'qrcode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OtpauthQr } from '@/components/otpauth-qr';

const URI =
  'otpauth://totp/EstomaSysTech:dono%40estomasystech.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=EstomaSysTech';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OtpauthQr', () => {
  it('Dado um otpauthUri, Quando renderizar, Então o QR codifica exatamente o link recebido', async () => {
    const spy = vi.spyOn(QRCode, 'toDataURL');
    render(<OtpauthQr uri={URI} />);

    const img = await screen.findByRole('img', {
      name: 'QR code para cadastrar o app autenticador',
    });
    expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe(URI);
  });

  it('Dado que a geração falha, Quando renderizar, Então nada é exibido', async () => {
    const spy = vi
      .spyOn(QRCode, 'toDataURL')
      .mockRejectedValue(new Error('falhou') as never);
    render(<OtpauthQr uri={URI} />);

    await waitFor(() => expect(spy).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('Dado que o link muda, Quando re-renderizar, Então gera um novo QR', async () => {
    const spy = vi.spyOn(QRCode, 'toDataURL');
    const { rerender } = render(<OtpauthQr uri={URI} />);
    await screen.findByRole('img');
    rerender(<OtpauthQr uri={`${URI}&x=1`} />);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
