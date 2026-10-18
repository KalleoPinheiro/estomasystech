import { describe, expect, it } from 'vitest';
import { CreatePatient } from '@/application/patients/create-patient';
import {
  GUARDIAN_ACCESS_REVOCATION_RESOURCE,
  GUARDIAN_REVOCATION_NOTICE_RESOURCE,
  revokeGuardianAccess,
} from '@/application/portal/revoke-guardian-access';
import type {
  EmailGateway,
  EmailMessage,
} from '@/application/ports/email-gateway';
import type { AuditEvent } from '@/domain/audit/audit-event';
import { Guardian } from '@/domain/guardian/guardian';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

const ACTOR = { subject: 'paciente@example.com', clinicId: null };

class FakeEmail implements EmailGateway {
  readonly sent: EmailMessage[] = [];
  constructor(private readonly mode: 'on' | 'off' | 'fail' = 'on') {}
  async isEnabled(): Promise<boolean> {
    return this.mode !== 'off';
  }
  async send(message: EmailMessage): Promise<void> {
    if (this.mode === 'fail') throw new Error('Resend API 500');
    this.sent.push(message);
  }
}

const setup = async (
  guardianEmail: string | null,
  email: EmailGateway,
  auditFails = false,
) => {
  const guardians = new InMemoryGuardianRepository();
  const patients = new InMemoryPatientRepository();
  const auditEvents = new InMemoryAuditEventRepository();
  const guardian = Guardian.create({
    fullName: 'Ana Souza',
    relationship: 'filho',
    phone: '11977770000',
    email: guardianEmail,
  });
  await guardians.save(guardian);
  const patient = await new CreatePatient(patients).execute({
    fullName: 'Paulo Titular',
    phone: '11999990000',
    guardianId: guardian.id,
  });
  if (auditFails) {
    const original = auditEvents.save.bind(auditEvents);
    let calls = 0;
    auditEvents.save = async (event: AuditEvent) => {
      calls += 1;
      if (calls > 1) throw new Error('audit down');
      return original(event);
    };
  }
  const run = () =>
    revokeGuardianAccess(
      { patients, auditEvents, guardians, email },
      patient,
      ACTOR,
    );
  return { run, patients, auditEvents, patient };
};

const noticeOf = async (auditEvents: InMemoryAuditEventRepository) =>
  auditEvents.findAll({ resourceType: GUARDIAN_REVOCATION_NOTICE_RESOURCE });

describe('aviso de encerramento ao responsável (ADR-028)', () => {
  it('envia e-mail curto sem motivo nem dado clínico e registra na trilha sem o endereço', async () => {
    const email = new FakeEmail();
    const { run, auditEvents, patient } = await setup('ana@example.com', email);
    await run();

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe('ana@example.com');
    expect(email.sent[0].text).toContain(patient.fullName);
    expect(email.sent[0].text).not.toMatch(/motivo|ferida|curativo|prontu/i);
    const [notice] = await noticeOf(auditEvents);
    expect(notice).toMatchObject({
      actorRole: 'patient',
      actorId: ACTOR.subject,
      patientId: patient.id,
    });
    expect(notice.detail).toContain('enviado');
    expect(notice.detail).not.toContain('ana@example.com');
  });

  it('falha no envio não bloqueia a revogação e fica na trilha', async () => {
    const { run, auditEvents, patients, patient } = await setup(
      'ana@example.com',
      new FakeEmail('fail'),
    );
    const revoked = await run();

    expect(revoked.guardianPortalRevokedAt).not.toBeNull();
    expect(
      (await patients.findById(patient.id))?.guardianPortalRevokedAt,
    ).not.toBeNull();
    expect((await noticeOf(auditEvents))[0].detail).toContain('falha');
  });

  it.each([
    ['responsável sem e-mail', null, 'on'],
    ['canal desativado', 'ana@example.com', 'off'],
  ] as const)(
    '%s: não envia, revoga e registra como não enviado',
    async (_n, guardianEmail, mode) => {
      const email = new FakeEmail(mode);
      const { run, auditEvents } = await setup(guardianEmail, email);
      await run();

      expect(email.sent).toHaveLength(0);
      expect((await noticeOf(auditEvents))[0].detail).toContain('não enviado');
      expect(
        await auditEvents.findAll({
          resourceType: GUARDIAN_ACCESS_REVOCATION_RESOURCE,
        }),
      ).toHaveLength(1);
    },
  );

  it('falha ao gravar a trilha do aviso não desfaz a revogação', async () => {
    const email = new FakeEmail();
    const { run, patient } = await setup('ana@example.com', email, true);

    const revoked = await run();

    expect(revoked.id).toBe(patient.id);
    expect(revoked.guardianPortalRevokedAt).not.toBeNull();
    expect(email.sent).toHaveLength(1);
  });
});
