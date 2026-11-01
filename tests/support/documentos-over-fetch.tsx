import type { ReactElement } from 'react';
import { ValidationError } from '@/domain/shared/errors';
import type { ActionResult } from '@/lib/action-result';
import { apiFetch } from '@/lib/client';
import { renderWithToast } from './render-with-toast';
import { resolveServerTree } from './server-page';

/**
 * As páginas `/documentos/*` agora são Server Components (#546, ADR-082) e
 * leem do servidor, não de `/api` pelo navegador. Estes dublês respondem a cada
 * leitura de servidor com a MESMA chamada HTTP que a página fazia antes, pelo
 * `fetch` simulado do teste: o cenário e a asserção de cada tela ficam como
 * estavam; só o canal da leitura mudou. A emissão (ilha de cliente) chama a
 * Server Action, que aqui também vira o `POST /api/documents/issue` simulado.
 *
 * Uso (em cada arquivo, com `vi.mock` no topo):
 * `vi.mock('@/lib/server/data/clinic-info', async () => (await import('../support/documentos-over-fetch')).clinicInfoOverFetch())`.
 */

/** O `fetch` simulado responde `{ success: false, error }`: a página mostra a mensagem. */
async function read<T>(path: string): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch (error) {
    throw new ValidationError(
      error instanceof Error ? error.message : 'Erro desconhecido',
    );
  }
}

const orNull = async <T,>(path: string): Promise<T | null> =>
  read<T>(path).catch(() => null);

export const sessionOverFetch = () => ({
  requireStaffPage: async () => {
    const identity = await orNull<{ account?: { role?: string } }>(
      '/api/auth/identity',
    );
    return {
      role: identity?.account?.role ?? 'company_admin',
      subject: 'staff@clinica.com',
    };
  },
});

export const clinicInfoOverFetch = () => ({
  getClinicInfoFor: () => read('/api/clinic-info'),
  getLegalControllerFor: () => read('/api/clinic-info/legal-controller'),
});

export const patientRecordOverFetch = () => ({
  getPatientRecord: (_session: unknown, id: string) =>
    read(`/api/patients/${id}`),
});

export const carePlanOverFetch = () => ({
  getCarePlanDetailFor: (_session: unknown, id: string) =>
    read(`/api/care-plans/${id}`),
});

export const documentsDataOverFetch = () => ({
  getAttendanceDocumentData: async (_session: unknown, id: string) => {
    const appointment = await orNull<{ patientId: string }>(
      `/api/appointments/${id}`,
    );
    const patient = appointment
      ? await orNull(`/api/patients/${appointment.patientId}`)
      : null;
    return { appointment, patient };
  },
  getInvoiceDocumentData: (_session: unknown, id: string) =>
    read(`/api/invoices/${id}`),
  getReceiptPartiesFor: (
    _session: unknown,
    invoiceId: string,
    payment: string,
  ) => read(`/api/invoices/${invoiceId}/payments/${payment}/receipt`),
  getPayoutReceiptFor: (session: { role: string }, id: string) =>
    read(
      session.role === 'profissional'
        ? `/api/my-payouts/${id}`
        : `/api/commission-payouts/${id}`,
    ),
  getConditionDocumentData: (_session: unknown, id: string) =>
    read(`/api/conditions/${id}`),
  getPrescribingProfessionalFor: (_session: unknown, id: string) =>
    orNull(`/api/professionals/${id}`),
  listConditionAssessmentsFor: (_session: unknown, id: string) =>
    read(`/api/conditions/${id}/assessments`),
});

/** Nenhum documento foi emitido antes: a ilha chama a emissão ao montar. */
export const noPriorIssuance = () => ({
  findDocumentIssuance: async () => null,
});

export const documentActionsOverFetch = () => ({
  issueDocument: async (input: unknown): Promise<ActionResult<unknown>> => {
    try {
      const data = await apiFetch('/api/documents/issue', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return { success: true, data, error: null };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  },
});

/** Renderiza a página de servidor com as leituras resolvidas, como o servidor faz. */
export async function renderDocumentPage(ui: ReactElement) {
  return renderWithToast((await resolveServerTree(ui)) as ReactElement);
}
