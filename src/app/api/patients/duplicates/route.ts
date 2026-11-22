import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { duplicateCheckSchema } from '@/lib/patient-input';
import { findPossibleDuplicatesFor } from '@/lib/server/patient-duplicates';

/**
 * Possíveis repetidos antes do cadastro rápido (#992). `POST` para os dados
 * pessoais irem no corpo, nunca na URL (que vai para log de acesso).
 */
export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () =>
    findPossibleDuplicatesFor(
      guard.session,
      duplicateCheckSchema.parse(await request.json()),
    ),
  );
}
