import { beforeAll, describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildPatient, buildProcedure } from '../support/builders';
import { ensureClinic } from '../support/clinics';
import { validCnpj } from '../support/cnpj';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const CLINIC = 'clinica-proposta-rota';

let route: typeof import('@/app/api/packages/proposta/route');
let patientId: string;
let procedureId: string;

const post = (body: unknown, headers: Record<string, string>) =>
  route.POST(jsonRequest('/api/packages/proposta', 'POST', body, headers));

const body = () => ({
  patientId,
  procedureId,
  totalSessions: 4,
  priceCents: 100_000,
  objective: 'Cicatrizar a lesão',
  payment: 'Pix',
});

beforeAll(async () => {
  route = await import('@/app/api/packages/proposta/route');
  await ensureClinic(CLINIC);
  const repos = await getRepositories(clinicScope(CLINIC));
  const clinic = await repos.clinics.findById(CLINIC);
  await repos.clinics.update(
    (clinic as NonNullable<typeof clinic>).updateInfo({
      cnpj: validCnpj('778899000001'),
      professionalName: 'Resp. Técnica',
      professionalRegistry: 'COREN-SP 999999',
    }),
  );
  const patient = buildPatient({ fullName: 'Maria das Dores' });
  await repos.patients.save(patient);
  const procedure = buildProcedure({ priceCents: 30_000 });
  await repos.procedures.save(procedure);
  patientId = patient.id;
  procedureId = procedure.id;
});

describe('Feature: rota da proposta do plano (#964)', () => {
  it('o Admin baixa o PDF sem cache compartilhado', async () => {
    const response = await post(body(), adminCookieHeader(CLINIC));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Content-Disposition')).toMatch(
      /attachment; filename="proposta-plano-\d{4}-\d{2}-\d{2}\.pdf"/,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it.each(['atendente', 'profissional'] as const)(
    '%s não gera a proposta',
    async (role) => {
      const response = await post(
        body(),
        cookieHeaderFor(role, undefined, CLINIC),
      );
      expect(response.status).toBe(403);
    },
  );

  it('sem objetivo responde 400', async () => {
    const response = await post(
      { ...body(), objective: '' },
      adminCookieHeader(CLINIC),
    );
    expect(response.status).toBe(400);
  });
});
