import 'server-only';
import { z } from 'zod';
import { ResolveReceipt } from '@/application/billing/resolve-receipt';
import { AuditEvent } from '@/domain/audit/audit-event';
import { ValidationError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import {
  sessionScope,
  writeClinicId,
  writeScope,
} from '@/lib/auth/tenant-scope';
import { authorizeDocumentIssuance } from './document-authorization';

/**
 * Emissão persistida de documento clínico (#94, DOC-01; #546, ADR-082): a data
 * do documento nunca é `new Date()` no render. Reimprimir o mesmo
 * `documentType`+`resourceId` devolve o mesmo registro (idempotente), porque a
 * emissão É o evento de auditoria `create` do documento. Uma só regra, usada
 * pela rota `POST /api/documents/issue` e pela Server Action da ilha de
 * emissão das páginas `/documentos/*`.
 */

export const DOCUMENT_TYPES = [
  'atestado',
  'consentimento',
  'plano-cuidados',
  'relatorio',
  'repasse',
  'recibo',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const NUMBER_PREFIX: Record<DocumentType, string> = {
  atestado: 'ATST',
  consentimento: 'TCLE',
  'plano-cuidados': 'PLAN',
  relatorio: 'REL',
  repasse: 'REP',
  recibo: 'REC',
};

export const issueDocumentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  resourceId: z.string().min(1).max(200),
  /** Recibo: fatura do recebimento (`resourceId`), para checar CPF e CNPJ (#326). */
  invoiceId: z.string().min(1).max(200).optional(),
});

export type IssueDocumentInput = z.output<typeof issueDocumentSchema>;

export interface DocumentIssuance {
  documentNumber: string;
  issuedAt: string;
}

const toIssuance = (
  documentType: DocumentType,
  event: AuditEvent,
): DocumentIssuance => ({
  documentNumber: `${NUMBER_PREFIX[documentType]}-${event.id.slice(0, 8).toUpperCase()}`,
  issuedAt: event.occurredAt.toISOString(),
});

/**
 * A emissão é o evento `create` mais antigo do documento. Leituras do mesmo
 * recurso (ex.: `read` do CPF no recibo) compartilham o tipo e o id, mas não
 * são emissão e não podem trocar o número.
 */
function firstEmission(events: AuditEvent[]): AuditEvent | undefined {
  // `findAll` devolve do mais novo para o mais antigo: o último `create` é a emissão.
  return events.filter((event) => event.action === 'create').at(-1);
}

/**
 * Número e data de um documento JÁ emitido, ou `null`. Só lê: a página usa para
 * imprimir a reimpressão já com o número, sem esperar a ilha de emissão.
 */
export async function findDocumentIssuance(
  session: Session,
  documentType: DocumentType,
  resourceId: string,
): Promise<DocumentIssuance | null> {
  const { auditEvents } = await getRepositories(sessionScope(session));
  const event = firstEmission(
    await auditEvents.findAll({ resourceType: documentType, resourceId }),
  );
  return event ? toIssuance(documentType, event) : null;
}

/**
 * Emite (ou reencontra) o documento. «Achar ou criar» roda numa transação com
 * trava consultiva por documento (ADR-082): duas abas abertas ao mesmo tempo
 * não geram dois números, porque a segunda espera a primeira confirmar e então
 * encontra o evento dela.
 */
export async function issueDocumentFor(
  session: Session,
  input: IssueDocumentInput,
): Promise<DocumentIssuance> {
  const { documentType, resourceId, invoiceId } = input;
  const clinicId = writeClinicId(session);
  const scope = writeScope(session);
  // R4 do recurso antes da transação: a tentativa negada não grava (#636, ADR-089).
  await authorizeDocumentIssuance(session, scope, documentType, {
    resourceId,
    invoiceId,
  });
  const { transactions } = await getRepositories(scope);

  return transactions.run(async (tx) => {
    // Sem CPF do pagador e CNPJ do prestador o recibo não vale para o IRPF:
    // não se emite (FIN-RN-15), nem chamando a ação ou a rota direto.
    if (documentType === 'recibo') {
      if (!invoiceId) {
        throw new ValidationError('Informe a fatura do recibo');
      }
      await new ResolveReceipt(tx.invoices, tx.patients, tx.clinics).execute({
        invoiceId,
        paymentId: resourceId,
        clinicId,
      });
    }

    await tx.auditEvents.lockResource(documentType, resourceId);
    const existing = firstEmission(
      await tx.auditEvents.findAll({ resourceType: documentType, resourceId }),
    );
    if (existing) return toIssuance(documentType, existing);

    const created = AuditEvent.create({
      clinicId,
      actorRole: session.role,
      actorId: session.subject,
      action: 'create',
      resourceType: documentType,
      resourceId,
      detail: 'emissão de documento',
    });
    await tx.auditEvents.save(created);
    return toIssuance(documentType, created);
  });
}
