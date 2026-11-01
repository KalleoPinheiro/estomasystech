'use server';

import { z } from 'zod';
import { ResolveDataSubjectRequest } from '@/application/patients/data-subject-requests';
import { MAX_RESOLUTION_LENGTH } from '@/domain/patient/data-subject-request';
import { ForbiddenError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { ActionResult } from '@/lib/action-result';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toDataSubjectRequestDto } from '@/lib/dto';
import { defineAction } from '@/lib/server/define-action';
import { readSession } from '@/lib/server/session';
import { rolesWithAccessTo } from '@/lib/staff-pages';

/**
 * Ações da tela de Pedidos do titular (#555, ADR-075): Server Action com guarda
 * de sessão e papel (a fila é da família `administrative`: só o Admin de
 * Empresa), `zod`, escopo de escrita e auditoria na MESMA transação da decisão.
 */

const REQUEST_ADMIN_ROLES = rolesWithAccessTo('/api/data-requests');

const resolveSchema = z.object({
  id: z.string().min(1).max(100),
  decision: z.enum(['accept', 'reject']),
  justification: z.string().trim().min(1).max(MAX_RESOLUTION_LENGTH),
});

/**
 * Grava a decisão e a trilha juntas: se a auditoria falha, o pedido continua
 * pendente (nunca decisão sem trilha, LGPD). O pedido de outra empresa é `404`.
 */
const resolveRecorded = defineAction({
  access: { kind: 'staff', roles: REQUEST_ADMIN_ROLES },
  input: resolveSchema,
  handler: async ({ input, tx }) => {
    const useCase = new ResolveDataSubjectRequest(
      tx.dataSubjectRequests,
      tx.userAccounts,
      // O aviso sai depois da confirmação, pelos repositórios de fora.
      { isEnabled: async () => false, send: async () => undefined },
    );
    const decided = await useCase.prepare({
      requestId: input.id,
      decision: input.decision,
      justification: input.justification,
    });
    await tx.dataSubjectRequests.save(decided);
    return decided;
  },
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'data_request',
    resourceId: result.id,
    patientId: result.patientId,
    detail: `${result.kind}: ${result.status}`,
  }),
});

/**
 * Aceita ou recusa o pedido, sempre com justificativa; o paciente vê a resposta
 * no portal e é avisado por e-mail DEPOIS da confirmação. `notified: false` não
 * é erro: a decisão está gravada e o aviso é só um efeito (sem conta ativa ou
 * canal desligado).
 */
export async function resolveDataRequest(
  input: z.input<typeof resolveSchema>,
): Promise<ActionResult<{ notified: boolean }>> {
  const result = await resolveRecorded(input);
  if (!result.success) return result;
  const state = await readSession();
  if (state.status !== 'active') throw new ForbiddenError('Não autenticado');
  const services = await getRepositories(writeScope(state.session));
  const notified = await new ResolveDataSubjectRequest(
    services.dataSubjectRequests,
    services.userAccounts,
    services.email,
  ).notifyDecision(result.data);
  return { success: true, data: { notified }, error: null };
}
