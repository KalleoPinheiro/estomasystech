import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import {
  issueDocumentFor,
  issueDocumentSchema,
} from '@/lib/server/document-issuance';

/**
 * Emissão persistida de documento clínico (#94, DOC-01): resolve "a data do
 * documento é `new Date()` no render" reaproveitando a trilha de auditoria já
 * existente — reimprimir o mesmo `documentType`+`resourceId` devolve o mesmo
 * registro (idempotente), em vez de gerar uma data nova a cada Ctrl+P. A regra
 * é a mesma da Server Action das páginas `/documentos/*` (#546, ADR-082).
 */
export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () =>
    issueDocumentFor(
      guard.session,
      issueDocumentSchema.parse(await request.json()),
    ),
  );
}
