import type { Session } from './session';

/** Quem age no portal, para o `detail` da auditoria: o próprio paciente ou o responsável dele. */
export function portalActorNoun(session: Pick<Session, 'role'>): string {
  return session.role === 'guardian' ? 'responsável' : 'paciente';
}
