'use client';

import { useEffect, useState } from 'react';

interface OtpauthQrProps {
  /** Link `otpauth://` do cadastro do autenticador (ACE-RN-19). */
  uri: string;
}

/**
 * QR do cadastro do segundo fator (#250). Gerado no navegador a partir do
 * `otpauthUri` já recebido: sem rota nova, sem gravar nem enviar o segredo.
 * A imagem é um `data:` URL (CSP `img-src 'self' data:`). Se a geração falhar
 * nada é exibido: a chave em texto e o link continuam como alternativa.
 */
export function OtpauthQr({ uri }: OtpauthQrProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSrc(null);
    // O gerador de QR só pesa no bundle de quem chega ao cadastro do segundo fator (#559).
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(uri, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 192,
        }),
      )
      .then((url) => active && setSrc(url))
      .catch(() => active && setSrc(null));
    return () => {
      active = false;
    };
  }, [uri]);

  if (!src) return null;
  return (
    // biome-ignore lint/performance/noImgElement: data URL gerado no cliente; next/image não otimiza
    <img
      src={src}
      alt="QR code para cadastrar o app autenticador"
      width={192}
      height={192}
      className="mb-3 rounded-md bg-white"
    />
  );
}
