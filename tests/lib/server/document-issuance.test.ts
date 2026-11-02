import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import { getRepositories } from '@/infrastructure/container';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { UNAUTHENTICATED_MESSAGE } from '@/lib/auth/unauthenticated-message';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../../support/clinics';
import { seedDocumentResource } from '../../support/document-resources';
import { sessionToken } from '../../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };
const refreshed = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));

const signIn = (
  role: Parameters<typeof sessionToken>[0],
  clinicId: string = CLINIC_A_ID,
) => {
  cookieStore.value = sessionToken(
    role,
    `${role}@clinica.com`,
    undefined,
    clinicId,
  );
};

const action = async () =>
  (await import('@/app/documentos/actions')).issueDocument;

const emissionsOf = async (resourceId: string, clinicId = CLINIC_A_ID) => {
  const { auditEvents } = await getRepositories(clinicScope(clinicId));
  return (await auditEvents.findAll({ resourceId })).filter(
    (event) => event.action === 'create',
  );
};

let counter = 0;
const newResource = () => `doc-${Date.now()}-${++counter}`;

beforeEach(async () => {
  await ensureTestClinics();
  refreshed.mockClear();
  signIn('company_admin');
});

describe('Feature: emissão do documento impresso por Server Action (#546, ADR-082)', () => {
  it('Dado um atestado ainda não emitido, Quando a ilha emite, Então devolve o número ATST e grava um único evento de emissão', async () => {
    const resourceId = await seedDocumentResource('atestado', CLINIC_A_ID);

    const result = await (await action())({
      documentType: 'atestado',
      resourceId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.documentNumber).toMatch(/^ATST-[0-9A-Z]{8}$/);
    expect(await emissionsOf(resourceId)).toHaveLength(1);
  });

  it('Dado o documento já emitido, Quando reimprimir, Então devolve o mesmo número e a mesma data, sem novo evento', async () => {
    const resourceId = await seedDocumentResource('consentimento', CLINIC_A_ID);
    const emit = await action();

    const first = await emit({ documentType: 'consentimento', resourceId });
    const again = await emit({ documentType: 'consentimento', resourceId });

    expect(again.data).toEqual(first.data);
    expect(await emissionsOf(resourceId)).toHaveLength(1);
  });

  it('Dadas várias abas emitindo o mesmo documento ao mesmo tempo, Quando todas chamam a emissão, Então todas recebem o mesmo número e só há um evento', async () => {
    const resourceId = await seedDocumentResource('relatorio', CLINIC_A_ID);
    const emit = await action();

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        emit({ documentType: 'relatorio', resourceId }),
      ),
    );

    expect(new Set(results.map((r) => r.data?.documentNumber)).size).toBe(1);
    expect(await emissionsOf(resourceId)).toHaveLength(1);
  });

  it('Dada uma leitura do mesmo recurso registrada depois da emissão, Quando reimprimir, Então o número continua o da emissão', async () => {
    const resourceId = await seedDocumentResource('atestado', CLINIC_A_ID);
    const emit = await action();
    const first = await emit({ documentType: 'atestado', resourceId });
    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
    await auditEvents.save(
      AuditEvent.create({
        clinicId: CLINIC_A_ID,
        actorRole: 'company_admin',
        actorId: 'staff',
        action: 'read',
        resourceType: 'atestado',
        resourceId,
      }),
    );

    const again = await emit({ documentType: 'atestado', resourceId });

    expect(again.data?.documentNumber).toBe(first.data?.documentNumber);
  });

  it('Dada uma leitura do recurso sem emissão, Quando emitir, Então a emissão cria o próprio evento', async () => {
    const resourceId = await seedDocumentResource('atestado', CLINIC_A_ID);
    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
    await auditEvents.save(
      AuditEvent.create({
        clinicId: CLINIC_A_ID,
        actorRole: 'company_admin',
        actorId: 'staff',
        action: 'read',
        resourceType: 'recibo',
        resourceId,
      }),
    );
    const { findDocumentIssuance } = await import(
      '@/lib/server/document-issuance'
    );
    const session = { role: 'company_admin', clinicId: CLINIC_A_ID } as never;
    expect(
      await findDocumentIssuance(session, 'recibo', resourceId),
    ).toBeNull();

    const result = await (await action())({
      documentType: 'atestado',
      resourceId,
    });

    expect(result.success).toBe(true);
    expect(await emissionsOf(resourceId)).toHaveLength(1);
  });

  it('Dado um documento de cada clínica, Quando cada uma emite, Então os registros são separados por empresa', async () => {
    const inAId = await seedDocumentResource('consentimento', CLINIC_A_ID);
    const inBId = await seedDocumentResource('consentimento', CLINIC_B_ID);
    const emit = await action();
    const inA = await emit({
      documentType: 'consentimento',
      resourceId: inAId,
    });
    signIn('company_admin', CLINIC_B_ID);

    const inB = await emit({
      documentType: 'consentimento',
      resourceId: inBId,
    });

    expect(inB.data?.documentNumber).not.toBe(inA.data?.documentNumber);
    expect(await emissionsOf(inAId, CLINIC_A_ID)).toHaveLength(1);
    expect(await emissionsOf(inAId, CLINIC_B_ID)).toHaveLength(0);
    expect(await emissionsOf(inBId, CLINIC_B_ID)).toHaveLength(1);
    expect(await emissionsOf(inBId, CLINIC_A_ID)).toHaveLength(0);
  });

  it('Dada a emissão concluída, Quando a ação responde, Então não relê a página (a leitura do prontuário não se repete)', async () => {
    await (await action())({
      documentType: 'plano-cuidados',
      resourceId: await seedDocumentResource('plano-cuidados', CLINIC_A_ID),
    });

    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dado documento já emitido, Quando consultar a emissão, Então a leitura devolve número e data sem gravar nada', async () => {
    const resourceId = await seedDocumentResource('atestado', CLINIC_A_ID);
    const emitted = await (await action())({
      documentType: 'atestado',
      resourceId,
    });
    const { findDocumentIssuance } = await import(
      '@/lib/server/document-issuance'
    );

    const found = await findDocumentIssuance(
      { role: 'company_admin', clinicId: CLINIC_A_ID } as never,
      'atestado',
      resourceId,
    );

    expect(found).toEqual(emitted.data);
    expect(await emissionsOf(resourceId)).toHaveLength(1);
  });

  describe('Cenário: guardas', () => {
    it('Dada sessão ausente, Quando emitir, Então responde não autenticado e não grava', async () => {
      cookieStore.value = undefined;
      const resourceId = newResource();

      const result = await (await action())({
        documentType: 'atestado',
        resourceId,
      });

      expect(result).toEqual({
        success: false,
        data: null,
        error: UNAUTHENTICATED_MESSAGE,
      });
      expect(await emissionsOf(resourceId)).toHaveLength(0);
    });

    it('Dada sessão do portal, Quando emitir, Então a ação recusa (documento é da equipe)', async () => {
      signIn('patient');
      const resourceId = newResource();

      const result = await (await action())({
        documentType: 'atestado',
        resourceId,
      });

      expect(result.success).toBe(false);
      expect(await emissionsOf(resourceId)).toHaveLength(0);
    });

    it('Dado tipo de documento desconhecido, Quando emitir, Então responde erro de validação', async () => {
      const result = await (await action())({
        documentType: 'nota-fiscal',
        resourceId: 'x',
      } as never);

      expect(result.success).toBe(false);
    });

    it('Dado recibo sem a fatura, Quando emitir, Então pede a fatura e não grava (FIN-RN-15)', async () => {
      const resourceId = newResource();

      const result = await (await action())({
        documentType: 'recibo',
        resourceId,
      });

      expect(result.error).toBe('Informe a fatura do recibo');
      expect(await emissionsOf(resourceId)).toHaveLength(0);
    });

    it('Dado recibo de fatura inexistente, Quando emitir, Então falha e não grava', async () => {
      const resourceId = newResource();

      const result = await (await action())({
        documentType: 'recibo',
        resourceId,
        invoiceId: 'fatura-que-nao-existe',
      });

      expect(result.success).toBe(false);
      expect(await emissionsOf(resourceId)).toHaveLength(0);
    });
  });
});
