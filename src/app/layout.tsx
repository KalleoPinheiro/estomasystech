import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { headers } from 'next/headers';
import { StagingBanner } from '@/components/staging-banner';
import { loadClinicTheme } from '@/lib/clinic-theme-server';
import {
  clinicThemeScript,
  resolveThemeMode,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
} from '@/lib/theme';
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

// viewport-fit=cover deixa o app ocupar a tela toda no iPhone; as bordas usam
// env(safe-area-inset-*). Sem maximum-scale/user-scalable: o zoom é do usuário.
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLOR_LIGHT },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLOR_DARK },
  ],
};

export const metadata: Metadata = {
  title: 'EstomaSysTech — Clínica de Estomaterapia',
  description:
    'Gestão de pacientes, agenda e faturamento para clínica de estomaterapia',
  // Instalar na tela inicial (#430): ícone do iOS e abertura sem a barra do Safari.
  // Favicon que acompanha o tema do navegador: grafite na aba clara, branco na
  // escura (contraste com a aba). O `favicon.ico` do app fica de reserva.
  icons: {
    icon: [
      {
        url: '/brand/favicon-grafite.svg',
        type: 'image/svg+xml',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/brand/favicon-branco.svg',
        type: 'image/svg+xml',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'EstomaSysTech' },
};

// CSP estrita com nonce (issue #76) exige um nonce novo por request — só existe
// se a renderização for dinâmica (docs/01-app/02-guides/content-security-policy.md).
// Cobre tanto páginas autenticadas quanto públicas (ex.: /login) — nenhuma delas
// tem hoje um caso de uso que justifique o ganho de estático/ISR sobre o custo
// de desativar essa otimização.
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Nonce da CSP (src/proxy.ts): sem ele o script inline do tema é bloqueado
  // por `strict-dynamic` e a página pisca no tema errado.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const theme = await loadClinicTheme();

  return (
    <html
      lang="pt-BR"
      // `system` sai claro do servidor; o script abaixo ajusta antes de pintar.
      data-theme={resolveThemeMode(theme.mode, false)}
      data-accent={theme.accent}
      suppressHydrationWarning
      className={`${sora.variable} ${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      {/* sv-body é o seletor base do Still Void: background, cor, família,
          escala tipográfica e antialiasing vêm todos do design system. */}
      <head>
        <script
          nonce={nonce}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: script de tema; o conteúdo vem de listas fechadas, sem entrada do usuário
          dangerouslySetInnerHTML={{ __html: clinicThemeScript(theme) }}
        />
      </head>
      <body className="sv-body min-h-dvh">
        <StagingBanner />
        <Providers theme={theme} nonce={nonce}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
