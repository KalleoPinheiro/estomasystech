import 'server-only';
import { cache } from 'react';
import type { AppVersionDto, SidebarIdentityDto } from '@/lib/dto';
import { logError } from '@/lib/log-error';
import { buildSidebarIdentity } from '@/lib/server/data/identity';
import { countLinkedTriageQueue } from '@/lib/server/data/triage';
import { getAppVersion } from '@/lib/server/data/version';
import { requireStaffPage } from '@/lib/server/session';
import { canRoleAccess } from '@/lib/staff-pages';
import { bottomNavFor } from '@/lib/staff-shortcuts';

/** O que o layout da equipe entrega pronto ao cliente; `undefined` = o cliente busca por `/api`. */
export interface StaffShell {
  identity?: SidebarIdentityDto;
  version?: AppVersionDto | null;
  /** Fotos aguardando triagem; só existe para quem tem o atalho de Triagem na barra do celular. */
  triageCount?: number;
}

/**
 * Dados do casco da equipe (menu lateral, barra do celular, rodapé de versão)
 * lidos no servidor, no mesmo passo do HTML (ADR-069 § 1): sem cascata de
 * `/api` nem salto de layout depois da hidratação. Sessão ausente ou fora da
 * equipe redireciona/nega (`requireStaffPage`). Falha de leitura não derruba a
 * tela: o campo fica `undefined` e o cliente cai na busca de sempre.
 */
export const loadStaffShell = cache(async (): Promise<StaffShell> => {
  const session = await requireStaffPage();
  const showsTriageCount =
    canRoleAccess('/api/photos/triage', session.role) &&
    bottomNavFor(session.role).some((item) => item.triageCount);
  const [identity, version, triageCount] = await Promise.allSettled([
    buildSidebarIdentity(session),
    getAppVersion(),
    showsTriageCount ? countLinkedTriageQueue(session) : undefined,
  ]);
  if (identity.status === 'rejected') {
    logError('Casco da equipe: falha ao ler a identidade', identity.reason);
  }
  if (version.status === 'rejected') {
    logError('Casco da equipe: falha ao ler a versão', version.reason);
  }
  if (triageCount.status === 'rejected') {
    logError('Casco da equipe: falha ao contar a triagem', triageCount.reason);
  }
  return {
    triageCount:
      triageCount.status === 'fulfilled' ? triageCount.value : undefined,
    identity: identity.status === 'fulfilled' ? identity.value : undefined,
    version: version.status === 'fulfilled' ? version.value : undefined,
  };
});
