import 'server-only';
import type { Session } from '@/lib/auth/session';
import { closuresUrl, closuresWindow } from '@/lib/closures-window';
import { logError } from '@/lib/log-error';
import { buildSidebarIdentity } from '@/lib/server/data/identity';
import {
  listProfessionalOptions,
  listProfessionalsFor,
} from '@/lib/server/data/professionals';
import { listClosuresFor } from '@/lib/server/data/schedule';
import {
  listAccountsFor,
  loadCalendarStatus,
  loadClinicSettings,
  loadEmailChannel,
  loadOwnAccountView,
  loadScheduleSettings,
} from '@/lib/server/data/settings';
import { canRoleAccess } from '@/lib/staff-pages';

type Entries = Record<string, unknown>;
type Read = (session: Session) => Promise<unknown>;

const CLINIC_INFO = '/api/settings/clinic-info';
const EMAIL_CHANNEL = '/api/settings/email-channel';
const IDENTITY = '/api/auth/identity';
const PROFESSIONALS = '/api/professionals';

/**
 * Leitura de cada rota que uma seção de Configurações consulta. A chave é a
 * URL consultada e `api` (só quando difere da chave) é a rota de autorização: o papel sem acesso a ela não tem o dado lido nem entregue
 * (a tela dele mostra o aviso de acesso negado, sem chamar nada).
 */
const READS: Record<string, { api?: string; read: Read }> = {
  [CLINIC_INFO]: { read: loadClinicSettings },
  '/api/settings/schedule': { read: loadScheduleSettings },
  [EMAIL_CHANNEL]: { read: loadEmailChannel },
  '/api/accounts': { read: listAccountsFor },
  [PROFESSIONALS]: { read: listProfessionalsFor },
  '/api/options/professionals': { read: listProfessionalOptions },
  '/api/settings/calendar-integration': {
    api: '/api/integrations/google-calendar',
    read: loadCalendarStatus,
  },
  [IDENTITY]: { read: buildSidebarIdentity },
  '/api/me': { read: loadOwnAccountView },
};

/** O que cada seção consulta ao abrir (as mesmas URLs que o cliente buscava). */
export const SECTION_QUERIES: Record<string, readonly string[]> = {
  dados: [CLINIC_INFO],
  identidade: [IDENTITY, CLINIC_INFO],
  privacidade: [CLINIC_INFO],
  horarios: ['/api/settings/schedule'],
  feriados: ['closures', '/api/options/professionals'],
  'google-agenda': ['/api/settings/calendar-integration'],
  email: [EMAIL_CHANNEL],
  contas: ['/api/accounts', PROFESSIONALS, EMAIL_CHANNEL],
  'minha-conta': ['/api/me'],
};

/**
 * Respostas que a seção `slug` consulta, lidas no servidor no mesmo passo do
 * HTML (#557, ADR-069/074): por requisição, no escopo da sessão, sem cache
 * compartilhado. Falha de leitura de uma consulta só a deixa de fora: o
 * cliente a busca por `/api` e mostra o erro como antes.
 */
export async function prefetchSettings(
  session: Session,
  slug: string,
  now: Date = new Date(),
): Promise<Entries> {
  const queries = SECTION_QUERIES[slug] ?? [];
  const settled = await Promise.all(
    queries.map(async (query): Promise<[string, unknown] | null> => {
      if (query === 'closures') {
        return readOne(closuresUrl(closuresWindow(now)), () =>
          listClosuresFor(session, closuresWindow(now)),
        );
      }
      const entry = READS[query];
      if (!canRoleAccess(entry.api ?? query, session.role)) return null;
      return readOne(query, () => entry.read(session));
    }),
  );
  return Object.fromEntries(settled.filter((item) => item !== null));
}

async function readOne(
  key: string,
  read: () => Promise<unknown>,
): Promise<[string, unknown] | null> {
  try {
    const value = await read();
    // Sem resposta (ex.: conta inativa) o cliente busca e mostra o erro da rota.
    return value === null ? null : [key, value];
  } catch (error) {
    logError(`Configurações: falha ao ler ${key} no servidor`, error);
    return null;
  }
}
