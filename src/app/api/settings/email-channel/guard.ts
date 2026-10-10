import type { NextRequest } from 'next/server';
import { ManageEmailChannel } from '@/application/clinic/manage-email-channel';
import { getRepositories, type Services } from '@/infrastructure/container';
import { fail } from '@/lib/api-response';
import { accountManager } from '@/lib/auth/account-manager';
import { type Guard, requireStaffSession } from '@/lib/auth/require-session';
import type { Session } from '@/lib/auth/session';
import { writeClinicId, writeScope } from '@/lib/auth/tenant-scope';

export const ONLY_COMPANY_ADMIN_MESSAGE =
  'Só o Admin de Empresa configura o canal de e-mail';

/**
 * Guarda das rotas do canal (C3, #266). A família `administrative` já barra
 * os outros papéis; a checagem de `company_admin` aqui é a defesa em
 * profundidade do ADR-002 — o super_admin nunca configura (ADR-007).
 */
export function requireChannelAdmin(
  request: NextRequest,
): Guard<Session | null> {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard;
  if (accountManager(guard.session).role !== 'company_admin') {
    return { ok: false, response: fail(ONLY_COMPANY_ADMIN_MESSAGE, 403) };
  }
  return guard;
}

export interface ChannelContext {
  clinicId: string;
  services: Services;
  manage: ManageEmailChannel;
}

/** Serviços da clínica da sessão e o caso de uso do canal. */
export async function channelContext(
  session: Session | null,
): Promise<ChannelContext> {
  const clinicId = writeClinicId(session);
  const services = await getRepositories(writeScope(session));
  return {
    clinicId,
    services,
    manage: new ManageEmailChannel(
      services.clinicChannels,
      services.email,
      clinicId,
    ),
  };
}
