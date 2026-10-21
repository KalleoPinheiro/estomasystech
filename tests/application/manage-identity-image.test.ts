import { describe, expect, it, vi } from 'vitest';
import {
  ManageAccountAvatar,
  ManageClinicLogo,
} from '@/application/identity/manage-identity-image';
import { prepareIdentityImage } from '@/application/identity/prepare-identity-image';
import type { ImageProcessor } from '@/application/ports/image-processor';
import type { PhotoStorage } from '@/application/ports/photo-storage';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import {
  HEIC_UNSUPPORTED_MESSAGE,
  MAX_IDENTITY_IMAGE_BYTES,
  MAX_IDENTITY_UPLOAD_BYTES,
} from '@/domain/clinic/identity-image';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryUserAccountRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const WEBP = new Uint8Array([1, 2, 3]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
);

class MemoryStorage implements PhotoStorage {
  readonly files = new Map<string, Uint8Array>();
  async write(id: string, data: Uint8Array) {
    this.files.set(id, data);
  }
  async read(id: string) {
    return this.files.get(id) ?? null;
  }
  async remove(id: string) {
    this.files.delete(id);
  }
}

const processor: ImageProcessor = { toIdentityWebp: async () => WEBP };

class MemoryClinics {
  constructor(private clinic: Clinic | null) {}
  failSave = false;
  async findById() {
    return this.clinic;
  }
  async saveLogoKey(clinic: Clinic) {
    if (this.failSave) throw new Error('banco fora do ar');
    this.clinic = clinic;
  }
  get current() {
    return this.clinic;
  }
}

const aClinic = (logoKey: string | null = null) =>
  Clinic.restore({
    id: 'c1',
    name: 'Clínica',
    createdBy: 'a',
    createdAt: new Date(),
    logoKey,
  });

const logoUseCase = (clinics: MemoryClinics, storage: PhotoStorage) =>
  new ManageClinicLogo(
    clinics as unknown as ClinicRepository,
    storage,
    processor,
  );

describe('Feature: Preparar a imagem enviada como logo ou avatar (#427)', () => {
  it('Dado arquivo vazio, Quando preparar, Então recusa', async () => {
    await expect(
      prepareIdentityImage(new Uint8Array(), processor),
    ).rejects.toThrow('Arquivo de imagem vazio');
  });

  it('Dado arquivo acima de 5 MB, Quando preparar, Então recusa antes de decodificar', async () => {
    const toIdentityWebp = vi.fn();

    await expect(
      prepareIdentityImage(new Uint8Array(MAX_IDENTITY_UPLOAD_BYTES + 1), {
        toIdentityWebp,
      }),
    ).rejects.toThrow('Imagem excede o limite de 5 MB');
    expect(toIdentityWebp).not.toHaveBeenCalled();
  });

  it('Dado um HEIC, Quando preparar, Então explica o que fazer no iPhone', async () => {
    const heic = new Uint8Array([
      0,
      0,
      0,
      24,
      ...new TextEncoder().encode('ftypheic'),
      0,
      0,
      0,
      0,
    ]);

    await expect(prepareIdentityImage(heic, processor)).rejects.toThrow(
      HEIC_UNSUPPORTED_MESSAGE,
    );
  });

  it('Dado um PNG, Quando preparar, Então devolve o WebP do processador', async () => {
    expect(await prepareIdentityImage(PNG, processor)).toEqual({
      data: WEBP,
      format: 'webp',
    });
  });

  it('Dado um SVG, Quando preparar, Então devolve o SVG reconstruído, sem chamar o processador', async () => {
    const toIdentityWebp = vi.fn();

    const prepared = await prepareIdentityImage(SVG, { toIdentityWebp });

    expect(prepared.format).toBe('svg');
    expect(new TextDecoder().decode(prepared.data)).toContain('<rect/>');
    expect(toIdentityWebp).not.toHaveBeenCalled();
  });

  it('Dado um SVG malicioso, Quando preparar, Então rejeita', async () => {
    const evil = new TextEncoder().encode('<svg onload="alert(1)"/>');

    await expect(prepareIdentityImage(evil, processor)).rejects.toThrow(
      ValidationError,
    );
  });

  it('Dado um SVG acima de 1 MB, Quando preparar, Então recusa', async () => {
    const big = new TextEncoder().encode(
      `<svg>${' '.repeat(MAX_IDENTITY_IMAGE_BYTES)}</svg>`,
    );

    await expect(prepareIdentityImage(big, processor)).rejects.toThrow(
      'SVG excede o limite de 1 MB',
    );
  });

  it('Dado raster que continua acima de 1 MB depois de convertido, Quando preparar, Então recusa', async () => {
    const heavy: ImageProcessor = {
      toIdentityWebp: async () => new Uint8Array(MAX_IDENTITY_IMAGE_BYTES + 1),
    };

    await expect(prepareIdentityImage(PNG, heavy)).rejects.toThrow(
      'Imagem excede o limite de 1 MB',
    );
  });
});

describe('Feature: Logo da clínica (#427)', () => {
  it('Dada clínica sem logo, Quando enviar, Então grava o arquivo e aponta a chave', async () => {
    const clinics = new MemoryClinics(aClinic());
    const storage = new MemoryStorage();

    const key = await logoUseCase(clinics, storage).set('c1', PNG);

    expect(key).toMatch(/^logo-.*-webp$/);
    expect(clinics.current?.logoKey).toBe(key);
    expect(storage.files.get(key)).toEqual(WEBP);
  });

  it('Dada clínica com logo, Quando enviar outra, Então a antiga é apagada do armazenamento', async () => {
    const storage = new MemoryStorage();
    storage.files.set('logo-velha-webp', WEBP);
    const clinics = new MemoryClinics(aClinic('logo-velha-webp'));

    const key = await logoUseCase(clinics, storage).set('c1', SVG);

    expect(key).toMatch(/-svg$/);
    expect([...storage.files.keys()]).toEqual([key]);
  });

  it('Dado que gravar o registro falha, Quando enviar, Então o arquivo novo é desfeito e a logo antiga segue', async () => {
    const storage = new MemoryStorage();
    storage.files.set('logo-velha-webp', WEBP);
    const clinics = new MemoryClinics(aClinic('logo-velha-webp'));
    clinics.failSave = true;

    await expect(logoUseCase(clinics, storage).set('c1', PNG)).rejects.toThrow(
      'banco fora do ar',
    );

    expect([...storage.files.keys()]).toEqual(['logo-velha-webp']);
    expect(clinics.current?.logoKey).toBe('logo-velha-webp');
  });

  it('Dado que desfazer o arquivo novo também falha, Quando enviar, Então o erro original é o que sobe', async () => {
    const storage = new MemoryStorage();
    storage.remove = async () => {
      throw new Error('armazenamento fora');
    };
    const clinics = new MemoryClinics(aClinic());
    clinics.failSave = true;

    await expect(logoUseCase(clinics, storage).set('c1', PNG)).rejects.toThrow(
      'banco fora do ar',
    );
  });

  it('Dado que apagar o arquivo antigo falha, Quando enviar, Então a troca vale mesmo assim', async () => {
    const storage = new MemoryStorage();
    const realRemove = storage.remove.bind(storage);
    storage.remove = async (id) => {
      if (id === 'logo-velha-webp') throw new Error('armazenamento fora');
      return realRemove(id);
    };
    const clinics = new MemoryClinics(aClinic('logo-velha-webp'));

    const key = await logoUseCase(clinics, storage).set('c1', PNG);

    expect(clinics.current?.logoKey).toBe(key);
  });

  it('Dado arquivo inválido, Quando enviar, Então nada é gravado', async () => {
    const storage = new MemoryStorage();
    const clinics = new MemoryClinics(aClinic());

    await expect(
      logoUseCase(clinics, storage).set('c1', new TextEncoder().encode('oi')),
    ).rejects.toThrow(ValidationError);

    expect(storage.files.size).toBe(0);
    expect(clinics.current?.logoKey).toBeNull();
  });

  it('Dada clínica inexistente, Quando enviar ou remover, Então NotFound', async () => {
    const useCase = logoUseCase(new MemoryClinics(null), new MemoryStorage());

    await expect(useCase.set('x', PNG)).rejects.toBeInstanceOf(NotFoundError);
    await expect(useCase.remove('x')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('Dada clínica com logo, Quando remover, Então a chave some e o arquivo é apagado', async () => {
    const storage = new MemoryStorage();
    storage.files.set('logo-a-webp', WEBP);
    const clinics = new MemoryClinics(aClinic('logo-a-webp'));

    await logoUseCase(clinics, storage).remove('c1');

    expect(clinics.current?.logoKey).toBeNull();
    expect(storage.files.size).toBe(0);
  });

  it('Dada clínica sem logo, Quando remover, Então nada acontece', async () => {
    const storage = new MemoryStorage();
    const clinics = new MemoryClinics(aClinic());
    const save = vi.spyOn(clinics, 'saveLogoKey');

    await logoUseCase(clinics, storage).remove('c1');

    expect(save).not.toHaveBeenCalled();
  });
});

describe('Feature: Avatar da equipe (#427)', () => {
  const setup = async () => {
    const accounts = new InMemoryUserAccountRepository();
    const account = UserAccount.create({
      email: 'ana@clinica.test',
      passwordHash: 'scrypt$x',
      role: 'atendente',
      clinicId: 'c1',
    });
    await accounts.save(account);
    const storage = new MemoryStorage();
    return {
      accounts,
      account,
      storage,
      useCase: new ManageAccountAvatar(accounts, storage, processor),
    };
  };

  it('Dada conta sem avatar, Quando enviar, Então a chave fica na conta e o arquivo no armazenamento', async () => {
    const { accounts, account, storage, useCase } = await setup();

    const key = await useCase.set(account, PNG);

    expect(key).toMatch(/^avatar-.*-webp$/);
    expect((await accounts.findById(account.id))?.avatarKey).toBe(key);
    expect(storage.files.get(key)).toEqual(WEBP);
  });

  it('Dada conta com avatar, Quando enviar outro, Então o antigo é apagado', async () => {
    const { accounts, account, storage, useCase } = await setup();
    const first = await useCase.set(account, PNG);
    const reloaded = (await accounts.findById(account.id)) as UserAccount;

    const second = await useCase.set(reloaded, SVG);

    expect([...storage.files.keys()]).toEqual([second]);
    expect(first).not.toBe(second);
  });

  it('Dado que salvar a conta de novo, Quando houver avatar, Então o save não desfaz o avatar', async () => {
    const { accounts, account, useCase } = await setup();
    const key = await useCase.set(account, PNG);

    await accounts.save(account);

    expect((await accounts.findById(account.id))?.avatarKey).toBe(key);
  });

  it('Dada conta com avatar, Quando remover, Então chave e arquivo somem', async () => {
    const { accounts, account, storage, useCase } = await setup();
    await useCase.set(account, PNG);
    const reloaded = (await accounts.findById(account.id)) as UserAccount;

    await useCase.remove(reloaded);

    expect((await accounts.findById(account.id))?.avatarKey).toBeNull();
    expect(storage.files.size).toBe(0);
  });

  it('Dada conta sem avatar, Quando remover, Então nada acontece', async () => {
    const { account, storage, useCase } = await setup();

    await expect(useCase.remove(account)).resolves.toBeUndefined();
    expect(storage.files.size).toBe(0);
  });

  it('Dado conta que não existe mais, Quando salvar a chave, Então é ignorado', async () => {
    const accounts = new InMemoryUserAccountRepository();

    await expect(
      accounts.saveAvatarKey('fantasma', 'avatar-x-webp'),
    ).resolves.toBeUndefined();
  });
});
