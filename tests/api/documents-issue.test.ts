import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { seedDocumentResource } from '../support/document-resources';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface IssuanceResponse {
  documentNumber: string;
  issuedAt: string;
}

describe('Feature: emissão persistida de documentos (#94, DOC-01) — POST /api/documents/issue', () => {
  const issue = async (
    documentType: string,
    resourceId: string,
    headers?: Record<string, string>,
  ) => {
    const route = await import('@/app/api/documents/issue/route');
    const response = await route.POST(
      jsonRequest(
        '/api/documents/issue',
        'POST',
        { documentType, resourceId },
        headers,
      ),
    );
    const json = (await response.json()) as Envelope<IssuanceResponse>;
    return { response, json };
  };

  describe('Cenário: idempotência', () => {
    it('Dado o mesmo documentType e resourceId, Quando emitir duas vezes, Então devolve o mesmo número e data', async () => {
      const resourceId = await seedDocumentResource('atestado', CLINIC_A_ID);
      const { json: first } = await issue('atestado', resourceId);
      const { json: second } = await issue('atestado', resourceId);

      expect(first.data.documentNumber).toBe(second.data.documentNumber);
      expect(first.data.issuedAt).toBe(second.data.issuedAt);
    });

    it('Dado resourceId diferente, Quando emitir, Então devolve número diferente', async () => {
      const { json: first } = await issue(
        'atestado',
        await seedDocumentResource('atestado', CLINIC_A_ID),
      );
      const { json: second } = await issue(
        'atestado',
        await seedDocumentResource('atestado', CLINIC_A_ID),
      );

      expect(first.data.documentNumber).not.toBe(second.data.documentNumber);
    });

    it('Dado o mesmo resourceId em documentType diferente, Quando emitir, Então trata como documentos distintos', async () => {
      const { json: attestation } = await issue(
        'atestado',
        await seedDocumentResource('atestado', CLINIC_A_ID),
      );
      const { json: consent } = await issue(
        'consentimento',
        await seedDocumentResource('consentimento', CLINIC_A_ID),
      );

      expect(attestation.data.documentNumber).not.toBe(
        consent.data.documentNumber,
      );
      expect(attestation.data.documentNumber.startsWith('ATST-')).toBe(true);
      expect(consent.data.documentNumber.startsWith('TCLE-')).toBe(true);
    });
  });

  describe('Cenário: registro por empresa (B6, #210 item 4)', () => {
    it('Dado o mesmo documento emitido na clínica A e na B, Quando emitir, Então cada empresa tem o seu registro (por empresa)', async () => {
      await ensureTestClinics();
      const inAId = await seedDocumentResource('atestado', CLINIC_A_ID);
      const inBId = await seedDocumentResource('atestado', CLINIC_B_ID);
      const inA = await issue(
        'atestado',
        inAId,
        adminCookieHeader(CLINIC_A_ID),
      );
      const inB = await issue(
        'atestado',
        inBId,
        adminCookieHeader(CLINIC_B_ID),
      );
      const againInA = await issue(
        'atestado',
        inAId,
        adminCookieHeader(CLINIC_A_ID),
      );

      expect(inA.response.status).toBe(200);
      expect(inB.response.status).toBe(200);
      expect(inB.json.data.documentNumber).not.toBe(
        inA.json.data.documentNumber,
      );
      expect(againInA.json.data.documentNumber).toBe(
        inA.json.data.documentNumber,
      );
    });
  });

  describe('Cenário: validação', () => {
    it('Dado documentType inválido, Quando emitir, Então responde 400', async () => {
      const { response } = await issue('nota-fiscal', 'res-1');
      expect(response.status).toBe(400);
    });
  });

  describe('Cenário: autenticação', () => {
    it('Dado nenhuma sessão, Quando POST /api/documents/issue, Então 401', async () => {
      const route = await import('@/app/api/documents/issue/route');
      const noCookieRequest = new NextRequest(
        'http://localhost/api/documents/issue',
        {
          method: 'POST',
          body: JSON.stringify({
            documentType: 'atestado',
            resourceId: 'apt-1',
          }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const response = await route.POST(noCookieRequest);

      expect(response.status).toBe(401);
    });
  });
});
