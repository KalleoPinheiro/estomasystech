import { appTimeZone } from '@/domain/shared/time-zone';

/** Fuso efetivo do processo Node (`TZ`), como o `Date` local o enxerga. */
export function processTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Checagem de inicialização (#205). O código com fuso explícito cobre grade,
 * lembretes, e-mails e documentos; o resto (feriados, séries recorrentes,
 * relatórios) ainda usa o `Date` local — então o processo precisa rodar no
 * mesmo fuso da aplicação. Em produção a divergência derruba a subida com
 * mensagem clara; fora dela, só avisa.
 */
export function assertProcessTimeZone(): void {
  const expected = appTimeZone();
  const actual = processTimeZone();
  if (actual === expected) {
    return;
  }
  const message =
    `Fuso do processo (${actual}) difere de APP_TIMEZONE (${expected}). ` +
    `Defina TZ=${expected} no ambiente (a imagem Docker já define) ou ajuste ` +
    'APP_TIMEZONE — senão agenda, lembretes e relatórios deslocam horários.';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  }
  console.warn(`[config] ${message}`);
}
