import { describe, expect, it, vi } from 'vitest';
import { ManageClinicLogo } from '@/application/identity/manage-identity-image';
import { prepareIdentityImage } from '@/application/identity/prepare-identity-image';
import type { ImageProcessor } from '@/application/ports/image-processor';
import type { PhotoStorage } from '@/application/ports/photo-storage';
import { Clinic } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import {
  MAX_IDENTITY_IMAGE_BYTES,
  MAX_IDENTITY_UPLOAD_BYTES,
} from '@/domain/clinic/identity-image';
import { NotFoundError } from '@/domain/shared/errors';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (size: number) => {
  const data = new Uint8Array(size);
  data.set(PNG_HEADER);
  return data;
};
const svgOfSize = (size: number) => {
  const head = '<svg xmlns="http://www.w3.org/2000/svg"><title>';
  const tail = '</title></svg>';
  return new TextEncoder().encode(
    head + 'a'.repeat(size - head.length - tail.length) + tail,
  );
};
const processorOf = (size: number): ImageProcessor => ({
  toIdentityWebp: async () => new Uint8Array(size),
});

describe('Feature: tetos de tamanho da imagem de identidade (#427)', () => {
  it('Dado arquivo com exatamente 5 MB, Quando preparar, Então aceita', async () => {
    await expect(
      prepareIdentityImage(png(MAX_IDENTITY_UPLOAD_BYTES), processorOf(10)),
    ).resolves.toMatchObject({ format: 'webp' });
  });

  it('Dado arquivo com 5 MB e 1 byte, Quando preparar, Então recusa', async () => {
    await expect(
      prepareIdentityImage(png(MAX_IDENTITY_UPLOAD_BYTES + 1), processorOf(10)),
    ).rejects.toThrow('Imagem excede o limite de 5 MB');
  });

  it('Dado WebP convertido com exatamente 1 MB, Quando preparar, Então aceita', async () => {
    await expect(
      prepareIdentityImage(png(10), processorOf(MAX_IDENTITY_IMAGE_BYTES)),
    ).resolves.toMatchObject({ format: 'webp' });
  });

  it('Dado WebP convertido com 1 MB e 1 byte, Quando preparar, Então recusa', async () => {
    await expect(
      prepareIdentityImage(png(10), processorOf(MAX_IDENTITY_IMAGE_BYTES + 1)),
    ).rejects.toThrow('Imagem excede o limite de 1 MB');
  });

  it('Dado SVG pouco abaixo de 1 MB, Quando preparar, Então aceita', async () => {
    await expect(
      prepareIdentityImage(
        svgOfSize(MAX_IDENTITY_IMAGE_BYTES - 100),
        processorOf(10),
      ),
    ).resolves.toMatchObject({ format: 'svg' });
  });

  it('Dado SVG de 1 MB e 1 byte, Quando preparar, Então recusa com a mensagem de SVG', async () => {
    await expect(
      prepareIdentityImage(
        svgOfSize(MAX_IDENTITY_IMAGE_BYTES + 1),
        processorOf(10),
      ),
    ).rejects.toThrow('SVG excede o limite de 1 MB');
  });
});

describe('Feature: troca e remoção da logo cuidam do arquivo antigo (#427)', () => {
  const aClinic = (logoKey: string | null) =>
    Clinic.restore({
      id: 'c1',
      name: 'Clínica',
      createdBy: 'a',
      createdAt: new Date(),
      logoKey,
    });
  const build = (clinic: Clinic | null, storage: PhotoStorage) => {
    const clinics = {
      findById: async () => clinic,
      saveLogoKey: vi.fn(async () => undefined),
    };
    return {
      clinics,
      useCase: new ManageClinicLogo(
        clinics as unknown as ClinicRepository,
        storage,
        processorOf(10),
      ),
    };
  };
  const storageOf = (remove: PhotoStorage['remove']): PhotoStorage => ({
    write: async () => undefined,
    read: async () => null,
    remove,
  });

  it('Dado clínica inexistente, Quando troca a logo, Então diz que a Clínica não foi encontrada', async () => {
    const { useCase } = build(
      null,
      storageOf(async () => undefined),
    );
    const error = await useCase.set('x', png(10)).catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toContain('Clínica');
  });

  it('Dado clínica sem logo, Quando remove, Então não toca no storage nem no banco', async () => {
    const remove = vi.fn(async () => undefined);
    const { useCase, clinics } = build(aClinic(null), storageOf(remove));
    await useCase.remove('c1');
    expect(remove).not.toHaveBeenCalled();
    expect(clinics.saveLogoKey).not.toHaveBeenCalled();
  });

  it('Dado clínica sem logo, Quando envia a primeira, Então não apaga arquivo nenhum', async () => {
    const remove = vi.fn(async () => undefined);
    const { useCase } = build(aClinic(null), storageOf(remove));
    await useCase.set('c1', png(10));
    expect(remove).not.toHaveBeenCalled();
  });

  it('Dado falha ao apagar a logo antiga, Quando troca, Então conclui e registra o erro com a chave', async () => {
    const logError = vi.fn();
    vi.resetModules();
    vi.doMock('@/lib/log-error', () => ({ logError }));
    const { ManageClinicLogo: Fresh } = await import(
      '@/application/identity/manage-identity-image'
    );
    const falha = new Error('storage fora');
    const clinics = {
      findById: async () => aClinic('logo-velha-webp'),
      saveLogoKey: async () => undefined,
    };
    const useCase = new Fresh(
      clinics as unknown as ClinicRepository,
      storageOf(async () => {
        throw falha;
      }),
      processorOf(10),
    );
    await expect(useCase.set('c1', png(10))).resolves.toMatch(/^logo-/);
    expect(logError).toHaveBeenCalledWith(
      'Identidade: falha ao apagar o arquivo antigo logo-velha-webp',
      falha,
    );
    vi.doUnmock('@/lib/log-error');
  });
});
