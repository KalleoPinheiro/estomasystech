import { describe, expect, it, vi } from 'vitest';
import {
  ReactivateClinic,
  SuspendClinic,
} from '@/application/platform/change-clinic-status';
import { UpdateClinicInfo } from '@/application/platform/update-clinic-info';
import type { ClinicProvisioning } from '@/application/ports/clinic-provisioning';
import { Clinic } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';

const AT = new Date('2026-10-20T12:00:00Z');

const clinic = () =>
  Clinic.restore({
    id: 'c-1',
    name: 'Clínica Alfa',
    createdBy: 'sistema',
    createdAt: AT,
    dpoName: 'Dra. Encarregada',
    dpoContact: 'dpo@alfa.com',
  });

const repoSem = (): ClinicRepository =>
  ({
    findById: async () => null,
    update: vi.fn(),
    saveStatus: vi.fn(),
  }) as unknown as ClinicRepository;

const repoCom = (found: Clinic) =>
  ({
    findById: async () => found,
    findByCnpj: async () => null,
    update: vi.fn(async () => undefined),
    saveStatus: vi.fn(async () => undefined),
  }) as unknown as ClinicRepository & {
    update: ReturnType<typeof vi.fn>;
  };

describe('Feature: Plataforma edita e altera o estado da clínica (Journey 6 a 8)', () => {
  it('Dado clínica inexistente, Quando editar, suspender ou reativar, Então devolve nulo sem gravar nada', async () => {
    const clinics = repoSem();
    const actor = { by: 'admin@x.com', at: AT, audit: vi.fn() };

    expect(await new UpdateClinicInfo(clinics).execute('x', {})).toBeNull();
    expect(
      await new SuspendClinic({
        clinics,
        clinicProvisioning: {} as ClinicProvisioning,
      }).execute('x', actor, { reason: 'non_payment' }),
    ).toBeNull();
    expect(await new ReactivateClinic(clinics).execute('x', actor)).toBeNull();
    expect(actor.audit).not.toHaveBeenCalled();
    expect(clinics.update).not.toHaveBeenCalled();
  });

  it('Dado encarregado cadastrado, Quando editar só o nome do encarregado, Então o contato é preservado', async () => {
    const clinics = repoCom(clinic());

    const updated = await new UpdateClinicInfo(clinics).execute('c-1', {
      dpoName: 'Dr. Novo',
    });

    expect(updated?.dpoName).toBe('Dr. Novo');
    expect(updated?.dpoContact).toBe('dpo@alfa.com');
  });

  it('Dado encarregado cadastrado, Quando editar só o contato, Então o nome é preservado', async () => {
    const clinics = repoCom(clinic());

    const updated = await new UpdateClinicInfo(clinics).execute('c-1', {
      dpoContact: 'novo@alfa.com',
    });

    expect(updated?.dpoName).toBe('Dra. Encarregada');
    expect(updated?.dpoContact).toBe('novo@alfa.com');
  });
});
