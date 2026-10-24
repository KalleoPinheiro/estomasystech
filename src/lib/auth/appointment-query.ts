import type { NextRequest } from 'next/server';
import { z } from 'zod';
import type { Session } from './session';

const rangeSchema = z.object({
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});

/** Período `from`/`to` (ISO 8601) da query; ausente ou inválido vira `null` (a rota responde 400). */
export function parseAppointmentRange(
  request: NextRequest,
): { from: Date; to: Date } | null {
  const parsed = rangeSchema.safeParse({
    from: request.nextUrl.searchParams.get('from'),
    to: request.nextUrl.searchParams.get('to'),
  });
  return parsed.success
    ? { from: new Date(parsed.data.from), to: new Date(parsed.data.to) }
    : null;
}

/**
 * Escopo dinâmico do Profissional (R4/RBAC-19), numa regra só para a lista e
 * a contagem da agenda: a sessão profissional vê apenas a própria agenda e
 * ignora `professionalId` da query. Profissional sem vínculo de conta (dado
 * legado/corrompido) nunca cai no "sem filtro = tudo": `none` pede resultado vazio.
 */
export function appointmentProfessionalScope(
  session: Pick<Session, 'role' | 'professionalId'>,
  request: NextRequest,
): { none: true } | { none: false; professionalId: string | undefined } {
  if (session.role !== 'profissional') {
    return {
      none: false,
      professionalId:
        request.nextUrl.searchParams.get('professionalId') ?? undefined,
    };
  }
  return session.professionalId
    ? { none: false, professionalId: session.professionalId }
    : { none: true };
}
