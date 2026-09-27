import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import {
  clearSessionRevocationCache,
  forgetSessionStatus,
  isSessionRevoked,
  REVOCATION_CACHE_TTL_MS,
} from '@/lib/auth/staff-revocation';

const adminSession = (subject: string): Session => ({
  expiresAtMs: Date.now() + 60_000,
  subject,
  role: 'company_admin',
  clinicId: 'legacy-clinic',
  professionalId: null,
});

describe('Feature: Revogação de sessão (SEC1-01..04, #194)', () => {
  beforeEach(() => {
    clearSessionRevocationCache();
  });

  it('Dado conta existente e inativa, Quando checar, Então sessão revogada', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue({ isActive: false, sessionVersion: 0 });

    expect(
      await isSessionRevoked(adminSession('ana@clinica.com'), lookup),
    ).toBe(true);
  });

  it('Dado conta existente e ativa, Quando checar, Então sessão válida', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue({ isActive: true, sessionVersion: 0 });

    expect(
      await isSessionRevoked(adminSession('ana@clinica.com'), lookup),
    ).toBe(false);
  });

  it("Dado subject 'local' (senha master), Quando checar, Então válida sem consultar o banco", async () => {
    const lookup = vi.fn();

    expect(await isSessionRevoked(adminSession('local'), lookup)).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('Dado email sem conta (login Google via allowlist), Quando checar, Então válida (deny-list, AD-001)', async () => {
    const lookup = vi.fn().mockResolvedValue(null);

    expect(
      await isSessionRevoked(adminSession('google@clinica.com'), lookup),
    ).toBe(false);
  });

  // #194: a regra antiga ("patient/partner nunca são checados") foi
  // substituída pela decisão do dono de revogar também as contas de portal.
  it('portal account deactivated is revoked (patient e partner, #194)', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue({ isActive: false, sessionVersion: 0 });
    const portal = (role: 'patient' | 'partner'): Session => ({
      expiresAtMs: Date.now() + 60_000,
      subject: `${role}@x.com`,
      role,
      clinicId: 'legacy-clinic',
      professionalId: null,
    });

    expect(await isSessionRevoked(portal('patient'), lookup)).toBe(true);
    expect(await isSessionRevoked(portal('partner'), lookup)).toBe(true);
    expect(lookup).toHaveBeenCalledWith('patient@x.com', 'legacy-clinic');
  });

  it('version mismatch revokes; versão igual segue válida (#194)', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue({ isActive: true, sessionVersion: 3 });

    expect(
      await isSessionRevoked(
        { ...adminSession('ana@clinica.com'), sessionVersion: 2 },
        lookup,
      ),
    ).toBe(true);
    expect(
      await isSessionRevoked(
        { ...adminSession('ana@clinica.com'), sessionVersion: 3 },
        lookup,
      ),
    ).toBe(false);
    // Token antigo, sem `sv`, vale como versão 0.
    expect(
      await isSessionRevoked(adminSession('ana@clinica.com'), lookup),
    ).toBe(true);
  });

  it('cache keyed by clinic: mesma conta em duas empresas não se contamina (#194)', async () => {
    const lookup = vi.fn(async (_email: string, clinicId: string | null) => ({
      isActive: clinicId !== 'clinica-a',
      sessionVersion: 0,
    }));
    const now = Date.now();
    const inClinic = (clinicId: string): Session => ({
      ...adminSession('ana@clinica.com'),
      clinicId,
    });

    expect(await isSessionRevoked(inClinic('clinica-a'), lookup, now)).toBe(
      true,
    );
    expect(await isSessionRevoked(inClinic('clinica-b'), lookup, now)).toBe(
      false,
    );
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('unknown subject stays valid (deny-list), qualquer papel', async () => {
    const lookup = vi.fn().mockResolvedValue(null);

    expect(
      await isSessionRevoked(
        {
          ...adminSession('ninguem@x.com'),
          role: 'patient',
          sessionVersion: 7,
        },
        lookup,
      ),
    ).toBe(false);
  });

  it('forgetSessionStatus: o próximo check deste processo reconsulta a conta', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce({ isActive: true, sessionVersion: 0 })
      .mockResolvedValueOnce({ isActive: true, sessionVersion: 1 });
    const now = Date.now();

    expect(
      await isSessionRevoked(adminSession('ana@clinica.com'), lookup, now),
    ).toBe(false);
    forgetSessionStatus('Ana@Clinica.com', 'legacy-clinic');
    expect(
      await isSessionRevoked(adminSession('ana@clinica.com'), lookup, now + 1),
    ).toBe(true);
  });

  it('Dado checagem repetida dentro de 60s, Quando checar de novo, Então usa cache (uma consulta só)', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue({ isActive: false, sessionVersion: 0 });
    const now = Date.now();

    await isSessionRevoked(adminSession('ana@clinica.com'), lookup, now);
    const revoked = await isSessionRevoked(
      adminSession('ana@clinica.com'),
      lookup,
      now + 30_000,
    );

    expect(revoked).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('Dado cache expirado, Quando checar de novo, Então consulta o banco novamente', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue({ isActive: true, sessionVersion: 0 });
    const now = Date.now();

    await isSessionRevoked(adminSession('ana@clinica.com'), lookup, now);
    await isSessionRevoked(
      adminSession('ana@clinica.com'),
      lookup,
      now + REVOCATION_CACHE_TTL_MS,
    );

    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('Dado falha na consulta, Quando checar, Então fail-open com log (AD-004)', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const lookup = vi.fn().mockRejectedValue(new Error('db fora'));

    expect(
      await isSessionRevoked(adminSession('ana@clinica.com'), lookup),
    ).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
