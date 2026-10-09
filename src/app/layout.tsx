import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from './providers';
import './globals.css';

// Fontes servidas do próprio repositório (variáveis, subset latin, OFL — ver
// src/app/fonts/LICENSE-*.txt). `next/font/google` baixava as fontes no build e
// a resposta do Google quebrava o build no CI de forma intermitente.
const sora = localFont({
  src: './fonts/sora-latin-wght-normal.woff2',
  variable: '--font-sora',
  weight: '100 800',
  display: 'swap',
});

const manrope = localFont({
  src: './fonts/manrope-latin-wght-normal.woff2',
  variable: '--font-manrope',
  weight: '200 800',
  display: 'swap',
});

const jetbrainsMono = localFont({
  src: './fonts/jetbrains-mono-latin-wght-normal.woff2',
  variable: '--font-jetbrains-mono',
  weight: '100 800',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VittaFlow — Clínica de Estomaterapia',
  description:
    'Gestão de pacientes, agenda e faturamento para clínica de estomaterapia',
};

// CSP estrita com nonce (issue #76) exige um nonce novo por request — só existe
// se a renderização for dinâmica (docs/01-app/02-guides/content-security-policy.md).
// Cobre tanto páginas autenticadas quanto públicas (ex.: /login) — nenhuma delas
// tem hoje um caso de uso que justifique o ganho de estático/ISR sobre o custo
// de desativar essa otimização.
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-theme="light"
      data-accent="violet"
      className={`${sora.variable} ${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      {/* sv-body é o seletor base do Still Void: background, cor, família,
          escala tipográfica e antialiasing vêm todos do design system. */}
      <body className="sv-body min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
