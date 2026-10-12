import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { Session } from '@/lib/auth/session';
import { loggedLines } from '../support/log-lines';

const afterTasks: Array<() => Promise<void>> = [];

vi.mock('next/server', () => ({
  after: (task: () => Promise<void>) => {
    afterTasks.push(task);
  },
}));

// Import após o mock de "next/server", como exigido pelo hoisting do vi.mock.
const { recordAudit, recordAuditNow } = await import('@/lib/audit');

function createRepositoryStub(): AuditEventRepository & {
  save: ReturnType<typeof vi.fn>;
} {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn(),
  } as unknown as AuditEventRepository & { save: ReturnType<typeof vi.fn> };
}

describe('Feature: Registro de auditoria best-effort (após a resposta)', () => {
  beforeEach(() => {
    afterTasks.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado sessão autenticada, Quando recordAudit, Então agenda gravação com ator da sessão', async () => {
    const auditEvents = createRepositoryStub();
    const session: Session = {
      expiresAtMs: Date.now() + 60_000,
      subject: 'maria@clinica.com',
      role: 'company_admin',
      clinicId: 'legacy-clinic',
      professionalId: null,
    };

    recordAudit(auditEvents, session, {
      action: 'read',
      resourceType: 'anamnesis',
      resourceId: 'patient-1',
      patientId: 'patient-1',
      detail: 'visualizou anamnese',
    });

    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]?.();

    expect(auditEvents.save).toHaveBeenCalledTimes(1);
    const saved = auditEvents.save.mock.calls[0][0];
    expect(saved.actorRole).toBe('company_admin');
    expect(saved.actorId).toBe('maria@clinica.com');
    expect(saved.action).toBe('read');
    expect(saved.resourceType).toBe('anamnesis');
    expect(saved.resourceId).toBe('patient-1');
    expect(saved.patientId).toBe('patient-1');
    expect(saved.detail).toBe('visualizou anamnese');
    expect(saved.clinicId).toBe('legacy-clinic');
  });

  it('Dado sessão autenticada de outra clínica, Quando recordAudit sem clinicId explícito, Então grava com a clínica da sessão (MT-29)', async () => {
    const auditEvents = createRepositoryStub();
    const session: Session = {
      expiresAtMs: Date.now() + 60_000,
      subject: 'maria@clinica.com',
      role: 'company_admin',
      clinicId: 'clinic-b',
      professionalId: null,
    };

    recordAudit(auditEvents, session, {
      action: 'update',
      resourceType: 'care_plan',
      resourceId: 'plan-1',
    });

    await afterTasks[0]?.();

    const saved = auditEvents.save.mock.calls[0][0];
    expect(saved.clinicId).toBe('clinic-b');
  });

  it("Dado sessão nula, Quando recordAudit, Então registra ator 'anonymous'", async () => {
    const auditEvents = createRepositoryStub();

    recordAudit(auditEvents, null, {
      action: 'update',
      resourceType: 'evolution',
      resourceId: 'note-1',
    });

    await afterTasks[0]?.();

    const saved = auditEvents.save.mock.calls[0][0];
    expect(saved.actorRole).toBe('anonymous');
    expect(saved.actorId).toBe('anonymous');
    expect(saved.patientId).toBeNull();
    expect(saved.detail).toBeNull();
  });

  it('Dado falha ao salvar, Quando a tarefa agendada roda, Então não lança e loga no console', async () => {
    const auditEvents = createRepositoryStub();
    auditEvents.save.mockRejectedValueOnce(new Error('banco indisponível'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    recordAudit(auditEvents, null, {
      action: 'delete',
      resourceType: 'condition',
      resourceId: 'cond-1',
    });

    await expect(afterTasks[0]?.()).resolves.toBeUndefined();
    expect(loggedLines(consoleSpy)).toContainEqual(
      expect.objectContaining({
        msg: 'Auditoria: falha ao registrar evento',
        error: expect.objectContaining({
          name: 'Error',
          stack: expect.any(String),
        }),
      }),
    );
  });
});

describe('Feature: Ator explícito pré-sessão (actorOverride, #71)', () => {
  beforeEach(() => {
    afterTasks.length = 0;
  });

  it('Dado actorOverride presente, Quando recordAudit, Então usa seus valores e ignora a sessão', async () => {
    const auditEvents = createRepositoryStub();
    const session: Session = {
      expiresAtMs: Date.now() + 60_000,
      subject: 'sessao@clinica.com',
      role: 'company_admin',
      clinicId: 'clinic-sessao',
      professionalId: null,
    };

    recordAudit(auditEvents, session, {
      action: 'read',
      resourceType: 'session',
      resourceId: 'login-attempt',
      actorOverride: {
        role: 'atendente',
        id: 'login@clinica.com',
        clinicId: 'clinic-override',
      },
    });

    await afterTasks[0]?.();

    const saved = auditEvents.save.mock.calls[0][0];
    expect(saved.actorRole).toBe('atendente');
    expect(saved.actorId).toBe('login@clinica.com');
    expect(saved.clinicId).toBe('clinic-override');
  });

  it('Dado actorOverride com clinicId nulo e sem sessão, Quando recordAuditNow, Então grava evento sem empresa (plataforma, B6)', async () => {
    const auditEvents = createRepositoryStub();

    await recordAuditNow(auditEvents, null, {
      action: 'read',
      resourceType: 'session',
      resourceId: 'login-attempt-2',
      actorOverride: {
        role: 'anonymous',
        id: 'sem-conta@clinica.com',
        clinicId: null,
      },
    });

    const saved = auditEvents.save.mock.calls[0][0];
    expect(saved.actorRole).toBe('anonymous');
    expect(saved.actorId).toBe('sem-conta@clinica.com');
    expect(saved.clinicId).toBeNull();
  });

  it('Dado actorOverride ausente, Quando recordAudit com sessão, Então comportamento atual é preservado (regressão zero)', async () => {
    const auditEvents = createRepositoryStub();
    const session: Session = {
      expiresAtMs: Date.now() + 60_000,
      subject: 'maria@clinica.com',
      role: 'company_admin',
      clinicId: 'legacy-clinic',
      professionalId: null,
    };

    recordAudit(auditEvents, session, {
      action: 'update',
      resourceType: 'clinic-info',
      resourceId: 'clinic-1',
    });

    await afterTasks[0]?.();

    const saved = auditEvents.save.mock.calls[0][0];
    expect(saved.actorRole).toBe('company_admin');
    expect(saved.actorId).toBe('maria@clinica.com');
    expect(saved.clinicId).toBe('legacy-clinic');
  });
});

describe('Feature: Auditoria write-ahead em ações críticas (SEC1-20..21)', () => {
  it('Dado sessão autenticada, Quando recordAuditNow, Então persiste antes de resolver com ator da sessão', async () => {
    const auditEvents = createRepositoryStub();
    const session: Session = {
      expiresAtMs: Date.now() + 60_000,
      subject: 'maria@clinica.com',
      role: 'company_admin',
      clinicId: 'legacy-clinic',
      professionalId: null,
    };

    await recordAuditNow(auditEvents, session, {
      action: 'read',
      resourceType: 'export',
      resourceId: 'patient-1',
      patientId: 'patient-1',
      detail: 'exportação LGPD do titular',
    });

    expect(auditEvents.save).toHaveBeenCalledTimes(1);
    const saved = auditEvents.save.mock.calls[0][0];
    expect(saved.actorId).toBe('maria@clinica.com');
    expect(saved.resourceType).toBe('export');
  });

  it('Dado falha ao persistir, Quando recordAuditNow, Então rejeita (requisição falha)', async () => {
    const auditEvents = createRepositoryStub();
    auditEvents.save.mockRejectedValue(new Error('banco indisponível'));
    const session: Session = {
      expiresAtMs: Date.now() + 60_000,
      subject: 'maria@clinica.com',
      role: 'company_admin',
      clinicId: 'legacy-clinic',
      professionalId: null,
    };

    await expect(
      recordAuditNow(auditEvents, session, {
        action: 'delete',
        resourceType: 'photo',
        resourceId: 'photo-1',
      }),
    ).rejects.toThrow('banco indisponível');
  });
});

describe('Feature: Evento sem empresa vira evento de plataforma (B6, #210)', () => {
  const superAdmin: Session = {
    expiresAtMs: Date.now() + 60_000,
    subject: 'dono@vitta.app',
    role: 'super_admin',
    clinicId: null,
    professionalId: null,
  };

  const savedClinicIdFor = async (
    session: Session | null,
    input: Partial<Parameters<typeof recordAuditNow>[2]> = {},
  ) => {
    const auditEvents = createRepositoryStub();
    await recordAuditNow(auditEvents, session, {
      action: 'create',
      resourceType: 'taxonomy_catalog',
      resourceId: 'r-1',
      ...input,
    });
    return auditEvents.save.mock.calls[0][0].clinicId;
  };

  it('Dada sessão sem empresa, override sem empresa ou nenhuma sessão, Quando recordAuditNow, Então grava sem empresa (clinicId null), nunca legacy-clinic', async () => {
    expect(await savedClinicIdFor(superAdmin)).toBeNull();
    expect(await savedClinicIdFor(null)).toBeNull();
    expect(
      await savedClinicIdFor(null, {
        actorOverride: { role: 'super_admin', id: 'script', clinicId: null },
      }),
    ).toBeNull();
  });

  it('Dada sessão sem empresa com clinicId explícito, Quando recordAuditNow, Então o clinicId explícito prevalece (clínica-alvo)', async () => {
    expect(
      await savedClinicIdFor(superAdmin, { clinicId: 'clinica-alvo' }),
    ).toBe('clinica-alvo');
  });

  it('Dado o código de src/lib/audit.ts, Quando resolve a empresa, Então não usa a clínica legada (sem clínica legada)', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/audit.ts'),
      'utf8',
    );
    expect(source).not.toContain('LEGACY_CLINIC_ID');
    expect(source).not.toContain('legacy-clinic');
  });
});
