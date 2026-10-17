import { SESSION_TTL_MS } from './session';

/**
 * Paciente que o responsável escolheu representar no portal (ADR-027). O valor
 * é só um id: cada requisição o revalida contra o vínculo do responsável
 * (`patients.guardian_id`), então adulterar o cookie não abre outro paciente.
 */
export const ACTING_PATIENT_COOKIE = 'vitta_acting_patient';

export function actingPatientCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
