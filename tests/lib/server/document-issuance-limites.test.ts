import { beforeAll, describe, expect, it } from 'vitest';
import { Invoice } from '@/domain/billing/invoice';
import { NotFoundError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  issueDocumentFor,
  issueDocumentSchema,
} from '@/lib/server/document-issuance';
import { buildPatient } from '../../support/builders';
import { CLINIC_A_ID, ensureTestClinics } from '../../support/clinics';
import { seedDocumentResource } from '../../support/document-resources';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/** Limites da entrada e do evento de emissão (ADR-082), incluindo o receituário (#956). */

const session: Session = {
  expiresAtMs: Date.now() + 3_600_000,
  subject: 'admin@clinica.com',
  role: 'company_admin',
  clinicId: CLINIC_A_ID,
  professionalId: null,
};

beforeAll(async () => {
  await ensureTestClinics();
});

describe('Feature: limites da emissão de documento', () => {
  it('Dado o id da fatura, Quando valida a entrada, Então aceita de 1 a 200 caracteres', () => {
    const parse = (invoiceId: string) =>
      issueDocumentSchema.safeParse({
        documentType: 'recibo',
        resourceId: 'pagamento',
        invoiceId,
      }).success;

    expect(parse('')).toBe(false);
    expect(parse('ab')).toBe(true);
    expect(parse('x'.repeat(200))).toBe(true);
    expect(parse('x'.repeat(201))).toBe(false);
  });

  it('Dado recibo com fatura existente e pagamento inexistente, Quando emite, Então resolve o recibo e acusa o pagamento, não a fatura ausente', async () => {
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const patient = buildPatient();
    await repos.patients.save(patient);
    const invoice = Invoice.create({
      patientId: patient.id,
      description: 'Consulta',
      amount: Money.fromCents(25_000),
    });
    await repos.invoices.save(invoice);

    const attempt = issueDocumentFor(session, {
      documentType: 'recibo',
      resourceId: 'pagamento-inexistente',
      invoiceId: invoice.id,
    });

    await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    await expect(attempt).rejects.toMatchObject({ entity: 'Pagamento' });
  });

  it('Dado plano de cuidados emitido, Quando lê a trilha, Então o evento de emissão diz que é emissão de documento', async () => {
    const resourceId = await seedDocumentResource(
      'plano-cuidados',
      CLINIC_A_ID,
    );

    const issuance = await issueDocumentFor(session, {
      documentType: 'plano-cuidados',
      resourceId,
    });

    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
    const [event] = await auditEvents.findAll({
      resourceType: 'plano-cuidados',
      resourceId,
    });
    expect(issuance.documentNumber).toMatch(/^PLAN-[0-9A-F]{8}$/);
    expect(event?.action).toBe('create');
    expect(event?.detail).toBe('emissão de documento');
  });

  it('Dado o receituário, Quando pedem pela regra única de emissão, Então o tipo é recusado (emissão própria, ADR-116)', () => {
    const parsed = issueDocumentSchema.safeParse({
      documentType: 'receituario',
      resourceId: 'plano-1',
    });

    expect(parsed.success).toBe(false);
  });

  it('Dado Atendente, Quando emite outro documento, Então a regra do receituário não o barra', async () => {
    const resourceId = await seedDocumentResource(
      'plano-cuidados',
      CLINIC_A_ID,
    );

    const issuance = await issueDocumentFor(
      { ...session, role: 'atendente' },
      { documentType: 'plano-cuidados', resourceId },
    );

    expect(issuance.documentNumber).toMatch(/^PLAN-/);
  });
});
