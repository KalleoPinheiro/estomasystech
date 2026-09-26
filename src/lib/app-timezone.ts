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

/**
 * Para o `instrumentation.ts`: erro lançado no `register()` o Next só loga
 * ("Failed to prepare server") e o processo segue vivo sem servir. Aqui a
 * configuração inválida é logada e encerra com código 1, para o orquestrador
 * ver a falha. Módulo só carregado no runtime Node.
 */
export async function enforceProcessTimeZone(): Promise<void> {
  try {
    assertProcessTimeZone();
  } catch (error) {
    const { logError } = await import('@/lib/log-error');
    logError('[config] Inicialização abortada', error);
    process.exit(1);
  }
}
