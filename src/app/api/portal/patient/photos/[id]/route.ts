import type { NextRequest } from 'next/server';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { getRepositories } from '@/infrastructure/container';
import { fail } from '@/lib/api-response';
import { requirePortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Foto vista pelo próprio paciente: sessão patient + condição da foto precisa
 * pertencer ao paciente autenticado. Parceiro nunca acessa fotos (minimização).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requirePortalSession(request, 'patient');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const { id } = await context.params;
  const services = await getRepositories(writeScope(session));
  const { conditionPhotos, conditions, photoStorage } = services;

  const photo = await conditionPhotos.findById(id);
  const condition = photo ? await conditions.findById(photo.conditionId) : null;
  const patient = await resolvePortalPatient(services, session).catch(
    () => null,
  );
  if (!photo || !condition || !patient || condition.patientId !== patient.id) {
    return fail('Foto não encontrada', 404);
  }

  const data = await photoStorage.read(photo.id);
  if (!data) {
    return fail('Foto não encontrada', 404);
  }

  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': photo.contentType,
      'Content-Length': String(data.byteLength),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
