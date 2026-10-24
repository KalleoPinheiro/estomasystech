import type { NextRequest } from 'next/server';
import { mfaPolicy } from '@/domain/auth/mfa';
import { isPhotoStorageAvailable } from '@/infrastructure/storage/unavailable-photo-storage';
import { handleRequest } from '@/lib/api-response';
import { requireOwnAccount } from '@/lib/auth/own-account';
import { accountAvatarUrl } from '@/lib/dto';

const avatarFields = (
  account: { id: string; avatarKey: string | null },
  storage: Parameters<typeof isPhotoStorageAvailable>[0],
) => {
  const avatarUrl = accountAvatarUrl(account.id, account.avatarKey);
  return {
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(isPhotoStorageAvailable(storage)
      ? {}
      : { imageUploadAvailable: false }),
  };
};

/** Dados de "Minha conta" (#295): e-mail, papel e situação do segundo fator. */
export async function GET(request: NextRequest) {
  const own = await requireOwnAccount(request);
  if (!own.ok) return own.response;

  return handleRequest(async () => {
    const { account, services } = own;
    const factor = await services.mfa.findFactor(account.id);
    return {
      email: account.email,
      role: account.role,
      // Chaves só aparecem quando há o que dizer: sem foto e com envio
      // disponível, a resposta é a de antes (#427).
      ...avatarFields(account, services.photoStorage),
      mfa: { policy: mfaPolicy(account.role), enrolled: factor !== null },
    };
  });
}
