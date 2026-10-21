import type { ImageProcessor } from '@/application/ports/image-processor';
import type { PhotoStorage } from '@/application/ports/photo-storage';
import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import {
  type IdentityImageKind,
  newIdentityKey,
} from '@/domain/clinic/identity-image';
import { NotFoundError } from '@/domain/shared/errors';
import { logError } from '@/lib/log-error';
import { prepareIdentityImage } from './prepare-identity-image';

/**
 * Grava a imagem nova, aponta a chave para ela e só então apaga a antiga: se
 * o registro falhar, o arquivo novo é desfeito e a identidade segue como estava.
 */
async function replaceImage(
  storage: PhotoStorage,
  kind: IdentityImageKind,
  prepared: Awaited<ReturnType<typeof prepareIdentityImage>>,
  previousKey: string | null,
  point: (key: string) => Promise<void>,
): Promise<string> {
  const key = newIdentityKey(kind, prepared.format);
  await storage.write(key, prepared.data);
  try {
    await point(key);
  } catch (error) {
    await storage.remove(key).catch(() => undefined);
    throw error;
  }
  await discard(storage, previousKey);
  return key;
}

/** Arquivo antigo órfão não derruba a troca: fica no log para limpeza. */
async function discard(storage: PhotoStorage, key: string | null) {
  if (!key) return;
  try {
    await storage.remove(key);
  } catch (error) {
    logError(`Identidade: falha ao apagar o arquivo antigo ${key}`, error);
  }
}

/** Logo da clínica (#427): só o Admin de Empresa chama (a rota confere o papel). */
export class ManageClinicLogo {
  constructor(
    private readonly clinics: ClinicRepository,
    private readonly storage: PhotoStorage,
    private readonly processor: ImageProcessor,
  ) {}

  private async load(clinicId: string) {
    const clinic = await this.clinics.findById(clinicId);
    if (!clinic) throw new NotFoundError('Clínica', clinicId);
    return clinic;
  }

  async set(clinicId: string, data: Uint8Array): Promise<string> {
    const clinic = await this.load(clinicId);
    const prepared = await prepareIdentityImage(data, this.processor);
    return replaceImage(this.storage, 'logo', prepared, clinic.logoKey, (key) =>
      this.clinics.saveLogoKey(clinic.withLogoKey(key)),
    );
  }

  async remove(clinicId: string): Promise<void> {
    const clinic = await this.load(clinicId);
    if (!clinic.logoKey) return;
    await this.clinics.saveLogoKey(clinic.withLogoKey(null));
    await discard(this.storage, clinic.logoKey);
  }
}

/** Avatar da equipe (#427): cada pessoa troca o próprio; paciente nunca (#376). */
export class ManageAccountAvatar {
  constructor(
    private readonly accounts: UserAccountRepository,
    private readonly storage: PhotoStorage,
    private readonly processor: ImageProcessor,
  ) {}

  async set(
    account: { id: string; avatarKey: string | null },
    data: Uint8Array,
  ): Promise<string> {
    const prepared = await prepareIdentityImage(data, this.processor);
    return replaceImage(
      this.storage,
      'avatar',
      prepared,
      account.avatarKey,
      (key) => this.accounts.saveAvatarKey(account.id, key),
    );
  }

  async remove(account: {
    id: string;
    avatarKey: string | null;
  }): Promise<void> {
    if (!account.avatarKey) return;
    await this.accounts.saveAvatarKey(account.id, null);
    await discard(this.storage, account.avatarKey);
  }
}
