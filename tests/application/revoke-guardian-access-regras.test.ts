import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePatient } from '@/application/patients/create-patient';
import {
  applyGuardianAccessRevocation,
  GUARDIAN_ACCESS_REVOCATION_DETAIL,
  GUARDIAN_ACCESS_REVOCATION_RESOURCE,
  GUARDIAN_REVOCATION_NOTICE_RESOURCE,
  notifyGuardianOfRevocation,
  revokeGuardianAccess,
} from '@/application/portal/revoke-guardian-access';
import type {
  EmailGateway,
  EmailMessage,
} from '@/application/ports/email-gateway';
import type { AuditEvent } from '@/domain/audit/audit-event';
import { Guardian } from '@/domain/guardian/guardian';
import { NotFoundError } from '@/domain/shared/errors';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/observability/logger', () => ({
  logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ACTOR = { subject: 'paciente@example.com', clinicId: 'clinica-1' };

class FakeEmail implements EmailGateway {
  readonly sent: EmailMessage[] = [];
  constructor(private readonly mode: 'on' | 'fail' = 'on') {}
  async isEnabled(): Promise<boolean> {
    return true;
  }
  async send(message: EmailMessage): Promise<void> {
    if (this.mode === 'fail') throw new Error('Resend API 500');
    this.sent.push(message);
  }
}

async function setup(withGuardian = true) {
  const guardians = new InMemoryGuardianRepository();
  const patients = new InMemoryPatientRepository();
  const auditEvents = new InMemoryAuditEventRepository();
  const guardian = Guardian.create({
    fullName: 'Ana Souza',
    relationship: 'filho',
    phone: '11977770000',
    email: 'ana@example.com',
  });
  await guardians.save(guardian);
  const patient = await new CreatePatient(patients).execute({
    fullName: 'Paulo Titular',
    phone: '11999990000',
    ...(withGuardian ? { guardianId: guardian.id } : {}),
  });
  return { guardians, patients, auditEvents, guardian, patient };
}

beforeEach(() => warn.mockClear());

describe('Feature: regras do encerramento do acesso do responsável (ADR-028)', () => {
  it('Dado paciente sem responsável, Quando encerra, Então 404 e nada é gravado nem enviado', async () => {
    const { patients, auditEvents, guardians, patient } = await setup(false);
    const email = new FakeEmail();

    await expect(
      revokeGuardianAccess(
        { patients, auditEvents, guardians, email },
        patient,
        ACTOR,
      ),
    ).rejects.toThrow(NotFoundError);

    expect(await auditEvents.findAll({ patientId: patient.id })).toEqual([]);
    expect(email.sent).toEqual([]);
  });

  it('Dado acesso já encerrado, Quando encerra de novo, Então 404 sem segunda trilha nem segundo e-mail', async () => {
    const { patients, auditEvents, guardians, patient } = await setup();
    const email = new FakeEmail();
    const repos = { patients, auditEvents, guardians, email };
    const revoked = await revokeGuardianAccess(repos, patient, ACTOR);

    await expect(revokeGuardianAccess(repos, revoked, ACTOR)).rejects.toThrow(
      NotFoundError,
    );

    expect(
      await auditEvents.findAll({
        resourceType: GUARDIAN_ACCESS_REVOCATION_RESOURCE,
      }),
    ).toHaveLength(1);
    expect(email.sent).toHaveLength(1);
  });

  it('Dado paciente com responsável, Quando encerra, Então a trilha usa o recurso, o detalhe e o autor corretos', async () => {
    const { patients, auditEvents, guardians, patient } = await setup();

    await revokeGuardianAccess(
      { patients, auditEvents, guardians, email: new FakeEmail() },
      patient,
      ACTOR,
    );

    const [event] = await auditEvents.findAll({
      resourceType: GUARDIAN_ACCESS_REVOCATION_RESOURCE,
    });
    expect(event).toMatchObject({
      clinicId: ACTOR.clinicId,
      actorRole: 'patient',
      actorId: ACTOR.subject,
      action: 'update',
      resourceId: patient.id,
      patientId: patient.id,
      detail: GUARDIAN_ACCESS_REVOCATION_DETAIL,
    });
    expect(GUARDIAN_ACCESS_REVOCATION_DETAIL).toBe(
      'paciente encerrou o acesso do responsável ao portal',
    );
  });

  it('Dado paciente com responsável, Quando só aplica a revogação, Então grava no repositório sem trilha nem aviso', async () => {
    const { patients, auditEvents, patient } = await setup();

    const revoked = await applyGuardianAccessRevocation({ patients }, patient);

    expect(revoked.guardianPortalRevokedAt).not.toBeNull();
    expect(
      (await patients.findById(patient.id))?.guardianPortalRevokedAt,
    ).not.toBeNull();
    expect(await auditEvents.findAll({ patientId: patient.id })).toEqual([]);
  });

  it('Dado paciente sem responsável ou já revogado, Quando só aplica, Então 404 e nada é gravado', async () => {
    const lone = await setup(false);
    await expect(
      applyGuardianAccessRevocation({ patients: lone.patients }, lone.patient),
    ).rejects.toThrow(NotFoundError);

    const done = await setup();
    const revoked = await applyGuardianAccessRevocation(
      { patients: done.patients },
      done.patient,
    );
    await expect(
      applyGuardianAccessRevocation({ patients: done.patients }, revoked),
    ).rejects.toThrow(NotFoundError);
  });

  it('Dado responsável com e-mail, Quando o aviso sai, Então assunto, texto e trilha são os combinados', async () => {
    const { patients, auditEvents, guardians, guardian, patient } =
      await setup();
    const email = new FakeEmail();

    await notifyGuardianOfRevocation(
      { auditEvents, guardians, email },
      patient,
      guardian.id,
      ACTOR,
    );

    expect(email.sent).toEqual([
      {
        to: 'ana@example.com',
        subject: 'EstomaSysTech: seu acesso ao portal foi encerrado',
        text:
          'Seu acesso ao portal em nome de Paulo Titular foi encerrado.\n\n' +
          'Você não verá mais esse paciente ao entrar. Os demais pacientes ' +
          'vinculados a você não foram afetados.\n\n' +
          'Em caso de dúvida, fale com a clínica.',
      },
    ]);
    const [notice] = await auditEvents.findAll({
      resourceType: GUARDIAN_REVOCATION_NOTICE_RESOURCE,
    });
    expect(notice).toMatchObject({
      clinicId: ACTOR.clinicId,
      actorRole: 'patient',
      actorId: ACTOR.subject,
      action: 'update',
      resourceId: patient.id,
      patientId: patient.id,
      detail: 'aviso do encerramento enviado ao responsável por e-mail',
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('Dado responsável inexistente, Quando o aviso sai, Então registra «não enviado» sem erro', async () => {
    const { auditEvents, guardians, patient } = await setup();
    const email = new FakeEmail();

    await notifyGuardianOfRevocation(
      { auditEvents, guardians, email },
      patient,
      'nao-existe',
      ACTOR,
    );

    expect(email.sent).toEqual([]);
    const [notice] = await auditEvents.findAll({
      resourceType: GUARDIAN_REVOCATION_NOTICE_RESOURCE,
    });
    expect(notice.detail).toBe(
      'aviso do encerramento não enviado: responsável sem e-mail ou canal desativado',
    );
  });

  it('Dado falha no envio, Quando o aviso sai, Então a trilha diz «falha» e o log mascara o endereço', async () => {
    const { auditEvents, guardians, guardian, patient } = await setup();

    await notifyGuardianOfRevocation(
      { auditEvents, guardians, email: new FakeEmail('fail') },
      patient,
      guardian.id,
      ACTOR,
    );

    const [notice] = await auditEvents.findAll({
      resourceType: GUARDIAN_REVOCATION_NOTICE_RESOURCE,
    });
    expect(notice.detail).toBe(
      'aviso do encerramento não enviado: falha no envio',
    );
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain(
      `Aviso de encerramento do acesso do paciente ${patient.id} não enviado para `,
    );
    expect(message).not.toContain('ana@example.com');
  });

  it('Dado falha ao ler o responsável sem endereço conhecido, Quando o aviso sai, Então o log não cita destinatário', async () => {
    const { auditEvents, guardians, patient } = await setup();
    guardians.findById = async () => {
      throw new Error('db down');
    };

    await notifyGuardianOfRevocation(
      { auditEvents, guardians, email: new FakeEmail() },
      patient,
      'qualquer',
      ACTOR,
    );

    expect(warn).toHaveBeenCalledWith(
      `Aviso de encerramento do acesso do paciente ${patient.id} não enviado`,
    );
  });

  it('Dado a trilha do aviso fora do ar, Quando o aviso sai, Então só o log registra', async () => {
    const { auditEvents, guardians, guardian, patient } = await setup();
    auditEvents.save = async (_event: AuditEvent) => {
      throw new Error('audit down');
    };

    await expect(
      notifyGuardianOfRevocation(
        { auditEvents, guardians, email: new FakeEmail() },
        patient,
        guardian.id,
        ACTOR,
      ),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      `Trilha do aviso de encerramento do paciente ${patient.id} não gravada`,
    );
  });
});
