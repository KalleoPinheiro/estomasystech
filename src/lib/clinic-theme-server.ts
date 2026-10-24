import { cookies } from 'next/headers';
import {
  type ClinicTheme,
  DEFAULT_CLINIC_THEME,
} from '@/domain/clinic/clinic-identity';
import { getRepositories } from '@/infrastructure/container';
import {
  getAuthConfig,
  SESSION_COOKIE,
  verifySessionToken,
} from './auth/session';
import { clinicScope } from './auth/tenant-scope';
import { logError } from './log-error';

/**
 * Tema da clínica da sessão, para o `<html>` sair certo do servidor (#426).
 * Sem sessão (login), sem clínica (plataforma) ou com qualquer falha, vale o
 * padrão: tema é cosmético e nunca derruba a página. Não consulta a revogação
 * da sessão — o dado é só o modo e a cor, e as rotas seguem barradas pelo proxy.
 */
export async function loadClinicTheme(): Promise<ClinicTheme> {
  try {
    const auth = getAuthConfig();
    if (!auth) return DEFAULT_CLINIC_THEME;
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const session = verifySessionToken(auth.secret, token);
    if (!session?.clinicId) return DEFAULT_CLINIC_THEME;
    const { clinics } = await getRepositories(clinicScope(session.clinicId));
    const clinic = await clinics.findById(session.clinicId);
    return clinic?.theme ?? DEFAULT_CLINIC_THEME;
  } catch (error) {
    logError('Tema da clínica: usando o padrão', error);
    return DEFAULT_CLINIC_THEME;
  }
}
