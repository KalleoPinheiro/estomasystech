import { beforeEach, describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { issueDocumentFor } from '@/lib/server/document-issuance';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';

process.env.ESTOMASYSTECH_DB_DRIVER ??= 'pglite';

const session = {
  role: 'company_admin',
  subject: 'admin@clinica.com',
  clinicId: CLINIC_A_ID,
} as unknown as Session;

beforeEach(async () => {
  await ensureTestClinics();
});

describe('Feature: emissão concorrente de documento (#546, ADR-082, Postgres real)', () => {
  it('Dadas 12 emissões simultâneas do mesmo documento em conexões diferentes, Quando todas terminam, Então há um único evento de emissão e um único número', async () => {
    const resourceId = `concorrente-${Date.now()}`;

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        issueDocumentFor(session, { documentType: 'atestado', resourceId }),
      ),
    );

    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
    const emissions = (await auditEvents.findAll({ resourceId })).filter(
      (event) => event.action === 'create',
    );
    expect(emissions).toHaveLength(1);
    expect(new Set(results.map((r) => r.documentNumber)).size).toBe(1);
  });
});
