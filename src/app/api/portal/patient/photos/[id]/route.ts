import type { NextRequest } from 'next/server';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { getRepositories } from '@/infrastructure/container';
import { fail } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Foto vista pelo próprio paciente: sessão patient + condição da foto precisa
 * pertencer ao paciente autenticado. Parceiro nunca acessa fotos (minimização).
 * Como na rota do staff (#209): leitura auditada e sem cache no navegador.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const { id } = await context.params;
  const services = await getRepositories(sessionScope(session));
  const { conditionPhotos, conditions, photoStorage, auditEvents } = services;

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
  recordAudit(auditEvents, session, {
    action: 'read',
    resourceType: 'photo',
    resourceId: photo.id,
    patientId: patient.id,
  });

  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': photo.contentType,
      'Content-Length': String(data.byteLength),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
