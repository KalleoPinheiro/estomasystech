import 'server-only';
import { getRepositories } from '@/infrastructure/container';
import { nextAuditCursor } from '@/lib/audit-cursor';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type AuditEventDto, toAuditEventDto } from '@/lib/dto';

/** Eventos por página da trilha: o mesmo da tela e o padrão da API. */
export const AUDIT_PAGE_SIZE = 25;

export interface AuditQuery {
  patientId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  /** Cursor opaco devolvido pela página anterior. */
  cursor?: string;
}

export interface AuditPageResult {
  events: AuditEventDto[];
  /** `null` quando a página veio incompleta, ou seja, não há mais eventos. */
  nextCursor: string | null;
}

/**
 * Trilha de auditoria da empresa da sessão, do mais recente para o mais antigo.
 * Mesma resposta de `GET /api/audit`, que reaproveita esta função, e fonte da
 * tela de Auditoria (ADR-074 § 3). O repositório é escopado pela empresa da
 * sessão: eventos de plataforma e de outras empresas nunca chegam aqui (B6).
 */
export async function listAuditEventsFor(
  session: Session,
  query: AuditQuery = {},
): Promise<AuditPageResult> {
  const limit = query.limit ?? AUDIT_PAGE_SIZE;
  const { auditEvents, patients } = await getRepositories(
    sessionScope(session),
  );
  const events = await auditEvents.findAll(
    { patientId: query.patientId, from: query.from, to: query.to },
    { limit, cursor: query.cursor },
  );
  // Nome do paciente em lote, no escopo da sessão (#197).
  const ids = [
    ...new Set(events.flatMap((e) => (e.patientId ? [e.patientId] : []))),
  ];
  const names = new Map(
    (ids.length > 0 ? await patients.findByIds(ids) : []).map((p) => [
      p.id,
      p.fullName,
    ]),
  );
  return {
    events: events.map((event) =>
      toAuditEventDto(
        event,
        event.patientId ? (names.get(event.patientId) ?? null) : null,
      ),
    ),
    nextCursor: nextAuditCursor(events, limit),
  };
}

/**
 * Nome do paciente do filtro da tela, para o seletor abrir já com ele sem
 * chamar `/api/patients/:id` (#555). Paciente de outra empresa ou inexistente
 * volta `null`: o escopo da sessão decide, a tela só mostra o id.
 */
export async function getPatientNameFor(
  session: Session,
  patientId: string,
): Promise<string | null> {
  const { patients } = await getRepositories(sessionScope(session));
  return (await patients.findById(patientId))?.fullName ?? null;
}
