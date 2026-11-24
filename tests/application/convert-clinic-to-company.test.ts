import { describe, expect, it, vi } from 'vitest';
import { DUPLICATE_CNPJ_MESSAGE } from '@/application/platform/clinic-cnpj';
import { ConvertClinicToCompany } from '@/application/platform/convert-clinic-to-company';
import { Clinic } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';

const individual = () =>
  Clinic.create({
    kind: 'individual',
    name: 'Jeiciele Silva',
    cpf: '529.982.247-25',
    contactPhone: '11 98888-7777',
    contactEmail: 'contato@exemplo.com',
    professionalRegistry: 'COREN-SP 123456',
    createdBy: 'super-admin',
  });

const repo = (found: Clinic | null, cnpjOwner: Clinic | null = null) =>
  ({
    findById: async () => found,
    findByCnpj: async () => cnpjOwner,
    findByCpf: async () => null,
    update: vi.fn(async () => undefined),
  }) as unknown as ClinicRepository & { update: ReturnType<typeof vi.fn> };

describe('Feature: caso de uso da troca de CPF por CNPJ (#986)', () => {
  it('grava a clínica convertida', async () => {
    const clinic = individual();
    const clinics = repo(clinic);
    const converted = await new ConvertClinicToCompany(clinics).execute(
      clinic.id,
      { cnpj: '12.345.678/0001-95' },
    );
    expect(converted?.kind).toBe('company');
    expect(clinics.update).toHaveBeenCalledWith(converted);
  });

  it('clínica inexistente devolve null sem gravar', async () => {
    const clinics = repo(null);
    expect(
      await new ConvertClinicToCompany(clinics).execute('x', {
        cnpj: '12.345.678/0001-95',
      }),
    ).toBeNull();
    expect(clinics.update).not.toHaveBeenCalled();
  });

  it('CNPJ de outra clínica é recusado', async () => {
    const clinic = individual();
    const other = individual();
    const clinics = repo(clinic, other);
    await expect(
      new ConvertClinicToCompany(clinics).execute(clinic.id, {
        cnpj: '12.345.678/0001-95',
      }),
    ).rejects.toThrow(DUPLICATE_CNPJ_MESSAGE);
    expect(clinics.update).not.toHaveBeenCalled();
  });
});
