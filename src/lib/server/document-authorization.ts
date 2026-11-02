import 'server-only';
import { ForbiddenError, NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { assertPatientLinkedForProfessionalWrite } from '@/lib/auth/professional-patient-scope';
import type { Session } from '@/lib/auth/session';
import type { TenantScope } from '@/lib/auth/tenant-scope';
import type { DocumentType } from './document-issuance';

/**
 * R4 na emissão de documento (#636, ADR-089): antes de gravar o evento de
 * emissão, o recurso do documento é resolvido por `documentType`+`resourceId`
 * no escopo da empresa. Recurso inexistente ou de outra empresa é `404` (o
 * escopo não o enxerga); Profissional sem vínculo com o paciente do recurso é
 * `403`. Admin e Atendente passam sem mudança. A tentativa negada não grava.
 */

type Repositories = Awaited<ReturnType<typeof getRepositories>>;

/** O que prende o recurso a quem pode emiti-lo: um paciente, ou o profissional do repasse. */
type Owner = { patientId: string } | { professionalId: string };

interface Target {
  resourceId: string;
  invoiceId?: string | undefined;
}

type OwnerResolver = (
  repos: Repositories,
  target: Target,
) => Promise<Owner | null>;

const patientOwner = (patientId: string | undefined): Owner | null =>
  patientId === undefined ? null : { patientId };

const OWNER_RESOLVERS: Record<DocumentType, OwnerResolver> = {
  atestado: async (repos, { resourceId }) =>
    patientOwner((await repos.appointments.findById(resourceId))?.patientId),
  consentimento: async (repos, { resourceId }) =>
    patientOwner((await repos.patients.findById(resourceId))?.id),
  'plano-cuidados': async (repos, { resourceId }) =>
    patientOwner((await repos.carePlans.findById(resourceId))?.patientId),
  relatorio: async (repos, { resourceId }) =>
    patientOwner((await repos.conditions.findById(resourceId))?.patientId),
  // `invoiceId` ausente já foi barrado em `authorizeDocumentIssuance`.
  recibo: async (repos, { invoiceId }) =>
    patientOwner(
      (await repos.invoices.findById(invoiceId as string))?.patientId,
    ),
  repasse: async (repos, { resourceId }) => {
    const payout = await repos.commissionPayouts.findById(resourceId);
    return payout ? { professionalId: payout.professionalId } : null;
  },
};

const ENTITY_LABEL: Record<DocumentType, string> = {
  atestado: 'Consulta',
  consentimento: 'Paciente',
  'plano-cuidados': 'Plano de cuidados',
  relatorio: 'Condição',
  recibo: 'Fatura',
  repasse: 'Repasse',
};

async function assertOwnerAllowed(
  session: Session,
  owner: Owner,
  repos: Repositories,
): Promise<void> {
  if ('professionalId' in owner) {
    // `professionalId` nulo da sessão nunca é igual ao do repasse.
    if (session.professionalId !== owner.professionalId) {
      throw new ForbiddenError(
        'Profissional só pode emitir o próprio comprovante de repasse',
      );
    }
    return;
  }
  await assertPatientLinkedForProfessionalWrite(
    session,
    owner.patientId,
    repos.professionalPatientLinks,
  );
}

export async function authorizeDocumentIssuance(
  session: Session,
  scope: TenantScope,
  documentType: DocumentType,
  target: Target,
): Promise<void> {
  if (session.role !== 'profissional') return;
  // Recibo sem fatura é entrada inválida (400), tratada pela própria emissão.
  if (documentType === 'recibo' && target.invoiceId === undefined) return;

  const repos = await getRepositories(scope);
  const owner = await OWNER_RESOLVERS[documentType](repos, target);
  if (!owner) {
    throw new NotFoundError(ENTITY_LABEL[documentType], target.resourceId);
  }
  await assertOwnerAllowed(session, owner, repos);
}
