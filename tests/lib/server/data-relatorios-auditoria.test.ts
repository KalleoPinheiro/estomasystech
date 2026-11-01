import { describe, expect, it } from 'vitest';
import { DataSubjectRequest } from '@/domain/patient/data-subject-request';
import { ForbiddenError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { getPatientNameFor, listAuditEventsFor } from '@/lib/server/data/audit';
import { listDataRequestsFor } from '@/lib/server/data/data-requests';
import { getMonthlyReportFor } from '@/lib/server/data/reports';
import { buildPatient } from '../../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../../support/clinics';
import { jsonRequest } from '../../support/request';
import { adminCookieHeader } from '../../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const session = (
  clinicId: string,
  role: Session['role'] = 'company_admin',
): Session =>
  ({
    role,
    subject: 'admin@clinica.com',
    clinicId,
    professionalId: null,
  }) as unknown as Session;

describe('Feature: relatórios, auditoria e pedidos do titular na camada de dados (#555)', () => {
  describe('Cenário: relatório do mês', () => {
    it('Dado um mês, Quando lê pela camada de dados, Então é o mesmo relatório da rota', async () => {
      await ensureTestClinics();
      const route = await import('@/app/api/reports/route');
      const response = await route.GET(
        jsonRequest(
          '/api/reports?month=2020-03',
          'GET',
          undefined,
          adminCookieHeader(CLINIC_A_ID),
        ),
      );
      const viaRoute = ((await response.json()) as { data: unknown }).data;

      const viaData = await getMonthlyReportFor(
        session(CLINIC_A_ID),
        '2020-03',
      );

      expect(JSON.parse(JSON.stringify(viaData))).toEqual(viaRoute);
    });

    it('Dado nenhum mês, Quando lê, Então devolve o relatório do mês corrente', async () => {
      await ensureTestClinics();
      const report = await getMonthlyReportFor(session(CLINIC_A_ID));
      expect(report.totalAppointments).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cenário: trilha de auditoria', () => {
    it('Dado eventos da clínica A, Quando a clínica B lê, Então não vê nenhum; e o nome do paciente vem em lote', async () => {
      await ensureTestClinics();
      const a = await getRepositories(clinicScope(CLINIC_A_ID));
      const patient = buildPatient({ fullName: 'Paciente Trilha' });
      await a.patients.save(patient);
      const { recordAuditNow } = await import('@/lib/audit');
      await recordAuditNow(a.auditEvents, session(CLINIC_A_ID), {
        action: 'read',
        resourceType: 'patient',
        resourceId: patient.id,
        patientId: patient.id,
      });

      const own = await listAuditEventsFor(session(CLINIC_A_ID), {
        patientId: patient.id,
      });
      expect(own.events).toHaveLength(1);
      expect(own.events[0].patientName).toBe('Paciente Trilha');
      expect(own.nextCursor).toBeNull();

      const other = await listAuditEventsFor(session(CLINIC_B_ID), {
        patientId: patient.id,
      });
      expect(other.events).toHaveLength(0);
    });

    it('Dado mais eventos que o limite, Quando lê a página, Então devolve o cursor da próxima e ela continua sem repetir', async () => {
      await ensureTestClinics();
      const a = await getRepositories(clinicScope(CLINIC_A_ID));
      const patient = buildPatient();
      await a.patients.save(patient);
      const { recordAuditNow } = await import('@/lib/audit');
      for (let i = 0; i < 3; i += 1) {
        await recordAuditNow(a.auditEvents, session(CLINIC_A_ID), {
          action: 'read',
          resourceType: 'patient',
          resourceId: patient.id,
          patientId: patient.id,
        });
      }

      const first = await listAuditEventsFor(session(CLINIC_A_ID), {
        patientId: patient.id,
        limit: 2,
      });
      expect(first.events).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await listAuditEventsFor(session(CLINIC_A_ID), {
        patientId: patient.id,
        limit: 2,
        cursor: first.nextCursor ?? undefined,
      });
      expect(second.events).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      const ids = [...first.events, ...second.events].map((e) => e.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('Dado paciente da clínica A, Quando a clínica B pede o nome, Então volta null', async () => {
      await ensureTestClinics();
      const a = await getRepositories(clinicScope(CLINIC_A_ID));
      const patient = buildPatient({ fullName: 'Só da A' });
      await a.patients.save(patient);

      expect(await getPatientNameFor(session(CLINIC_A_ID), patient.id)).toBe(
        'Só da A',
      );
      expect(
        await getPatientNameFor(session(CLINIC_B_ID), patient.id),
      ).toBeNull();
    });
  });

  describe('Cenário: fila de pedidos do titular', () => {
    it('Dado pedidos da clínica A, Quando o Admin da A lê, Então vê com o nome; a B não vê; outro papel é barrado', async () => {
      await ensureTestClinics();
      const a = await getRepositories(clinicScope(CLINIC_A_ID));
      const patient = buildPatient({ fullName: 'Titular Fila' });
      await a.patients.save(patient);
      const request = DataSubjectRequest.create({
        patientId: patient.id,
        kind: 'correction',
        details: 'Corrigir telefone',
      });
      await a.dataSubjectRequests.save(request);

      const own = await listDataRequestsFor(session(CLINIC_A_ID), 'pending');
      expect(own.find((r) => r.id === request.id)?.patientName).toBe(
        'Titular Fila',
      );
      const other = await listDataRequestsFor(session(CLINIC_B_ID), 'pending');
      expect(other.find((r) => r.id === request.id)).toBeUndefined();
      await expect(
        listDataRequestsFor(session(CLINIC_A_ID, 'atendente'), 'pending'),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
