import { describe, expect, it, vi } from 'vitest';
import { UpdateClinicTheme } from '@/application/clinic/update-clinic-theme';
import { Clinic } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';

const clinic = Clinic.restore({
  id: 'c1',
  name: 'Clínica',
  createdBy: 'a',
  createdAt: new Date(),
});

const build = (found: Clinic | null) => {
  const saveTheme = vi.fn(async () => undefined);
  const repo = {
    findById: vi.fn(async () => found),
    saveTheme,
  } as unknown as ClinicRepository;
  return { useCase: new UpdateClinicTheme(repo), saveTheme };
};

describe('Feature: Admin escolhe o tema da clínica (#426)', () => {
  it('Dado modo e cor válidos, Quando salvar, Então grava só o tema e devolve a escolha', async () => {
    const { useCase, saveTheme } = build(clinic);

    const theme = await useCase.execute('c1', { mode: 'dark', accent: 'cyan' });

    expect(theme).toEqual({ mode: 'dark', accent: 'cyan' });
    expect(saveTheme).toHaveBeenCalledTimes(1);
    const saved = (saveTheme.mock.calls[0] as unknown as [Clinic])[0];
    expect(saved.theme).toEqual({ mode: 'dark', accent: 'cyan' });
  });

  it('Dada cor livre, Quando salvar, Então recusa e nada é gravado', async () => {
    const { useCase, saveTheme } = build(clinic);

    await expect(
      useCase.execute('c1', { mode: 'light', accent: '#ff00ff' }),
    ).rejects.toThrow(ValidationError);
    expect(saveTheme).not.toHaveBeenCalled();
  });

  it('Dada clínica inexistente, Quando salvar, Então diz que a Clínica não foi encontrada', async () => {
    const { useCase, saveTheme } = build(null);

    const error = await useCase
      .execute('x', { mode: 'light', accent: 'cyan' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toContain('Clínica');
    expect(saveTheme).not.toHaveBeenCalled();
  });
});
