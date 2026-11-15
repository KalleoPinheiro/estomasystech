import 'server-only';
import { adminStatusOf } from '@/application/platform/clinic-overview';
import { ManageClinicAdmins } from '@/application/platform/manage-clinic-admins';
import { getRepositories } from '@/infrastructure/container';
import { nextAuditCursor } from '@/lib/audit-cursor';
import type { Session } from '@/lib/auth/session';
import { clinicScope, sessionScope } from '@/lib/auth/tenant-scope';
import {
  type ClinicAdminDto,
  type PlatformAuditEventDto,
  type PlatformClinicDetailDto,
  type PlatformClinicSummaryDto,
  toClinicAdminDto,
  toPlatformAuditEventDto,
  toPlatformClinicDetailDto,
  toPlatformClinicSummaryDto,
} from '@/lib/dto';

/**
 * Dados das telas da plataforma (#558, ADR-074): cada função devolve a MESMA
 * resposta da rota `/api/platform/*` de mesmo assunto, que passa a chamá-la.
 * Quem chama já decidiu o papel (guarda da página ou da rota); a sessão do
 * super_admin não tem empresa, então `sessionScope` é o escopo de sistema que
 * o catálogo de clínicas e a trilha de plataforma exigem.
 */

/** `GET /api/platform/clinics`: clínicas por nome, com admin e canal de e-mail. */
export async function listPlatformClinics(
  session: Session,
): Promise<PlatformClinicSummaryDto[]> {
  const { clinics } = await getRepositories(sessionScope(session));
  const all = await clinics.findAll();
  const rows = await Promise.all(
    all.map(async (clinic) => {
      const { userAccounts, clinicChannels } = await getRepositories(
        clinicScope(clinic.id),
      );
      const [admins, emailStatus] = await Promise.all([
        userAccounts.findByRole('company_admin'),
        clinicChannels.findStatus('email'),
      ]);
      return toPlatformClinicSummaryDto(
        clinic,
        adminStatusOf(admins),
        emailStatus,
      );
    }),
  );
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** `GET /api/platform/clinics/[id]`: cadastro e canal de e-mail; `null` se a clínica não existe. */
export async function loadPlatformClinicDetail(
  id: string,
): Promise<PlatformClinicDetailDto | null> {
  const services = await getRepositories(clinicScope(id));
  const clinic = await services.clinics.findById(id);
  if (!clinic) return null;
  return toPlatformClinicDetailDto(
    clinic,
    await services.clinicChannels.findStatus('email'),
  );
}

/** `GET /api/platform/clinics/[id]/admins`: Admins de Empresa da clínica; `null` se ela não existe. */
export async function listPlatformClinicAdmins(
  id: string,
): Promise<ClinicAdminDto[] | null> {
  const services = await getRepositories(clinicScope(id));
  if (!(await services.clinics.findById(id))) return null;
  return (await new ManageClinicAdmins(services).list()).map(toClinicAdminDto);
}

export interface PlatformAuditQuery {
  from?: Date;
  to?: Date;
  limit: number;
  /** Cursor opaco devolvido pela página anterior. */
  cursor?: string;
}

export interface PlatformAuditPage {
  events: PlatformAuditEventDto[];
  /** `null` quando a página veio incompleta, ou seja, não há mais eventos. */
  nextCursor: string | null;
}

/** `GET /api/platform/audit`: eventos sem empresa e ações do super_admin, com o nome da clínica. */
export async function listPlatformAuditFor(
  session: Session,
  query: PlatformAuditQuery,
): Promise<PlatformAuditPage> {
  const { auditEvents, clinics } = await getRepositories(sessionScope(session));
  const events = await auditEvents.findPlatformTrail(
    { from: query.from, to: query.to },
    { limit: query.limit, cursor: query.cursor },
  );
  const names = new Map(
    (await clinics.findAll()).map((clinic) => [clinic.id, clinic.name]),
  );
  return {
    events: events.map((event) =>
      toPlatformAuditEventDto(
        event,
        event.clinicId ? (names.get(event.clinicId) ?? null) : null,
      ),
    ),
    nextCursor: nextAuditCursor(events, query.limit),
  };
}
