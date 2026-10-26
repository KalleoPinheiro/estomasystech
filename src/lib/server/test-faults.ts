import 'server-only';
import { cookies } from 'next/headers';

/** Cookie com as leituras que a suíte E2E quer ver falhar (`agenda`, `contagem`, ...), separadas por vírgula. */
export const FAULT_COOKIE = 'e2e-fault';

/**
 * Gancho de teste: o navegador não consegue fazer uma leitura do SERVIDOR falhar,
 * então a suíte E2E liga `ESTOMASYSTECH_E2E_FAULTS=1` no servidor que ela sobe e
 * pede a falha pelo cookie `e2e-fault`. Sem a variável (produção, homologação,
 * desenvolvimento) esta função não faz nada, e o cookie só afeta a leitura de
 * quem o enviou.
 */
export async function failIfInjected(read: string): Promise<void> {
  if (process.env.ESTOMASYSTECH_E2E_FAULTS !== '1') {
    return;
  }
  const requested = (await cookies()).get(FAULT_COOKIE)?.value ?? '';
  if (requested.split(',').includes(read)) {
    throw new Error(`Falha simulada pelo teste E2E (${read})`);
  }
}
