import type { NextRequest } from 'next/server';
import { ManageAccountAvatar } from '@/application/identity/manage-identity-image';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireOwnAccount } from '@/lib/auth/own-account';
import { accountAvatarUrl } from '@/lib/dto';
import {
  IDENTITY_UPLOAD_RATE_LIMIT,
  readIdentityUpload,
  storageUnavailable,
  tooManyUploads,
} from '@/lib/identity-upload';

/** Avatar da própria conta da equipe (#427); paciente e parceiro não têm (#376). */
export async function POST(request: NextRequest) {
  const own = await requireOwnAccount(request);
  if (!own.ok) return own.response;
  const { account, session, services } = own;
  if (!(await IDENTITY_UPLOAD_RATE_LIMIT.allow(`avatar:${account.id}`))) {
    return tooManyUploads();
  }
  const unavailable = storageUnavailable(services.photoStorage);
  if (unavailable) return unavailable;
  const upload = await readIdentityUpload(request);
  if (!upload.ok) return upload.response;

  return handleRequest(async () => {
    const key = await new ManageAccountAvatar(
      services.userAccounts,
      services.photoStorage,
      services.imageProcessor,
    ).set(account, upload.data);
    recordAudit(services.auditEvents, session, {
      action: 'update',
      resourceType: 'account',
      resourceId: account.id,
      detail: 'avatar enviado',
    });
    return { avatarUrl: accountAvatarUrl(account.id, key) };
  });
}

export async function DELETE(request: NextRequest) {
  const own = await requireOwnAccount(request);
  if (!own.ok) return own.response;
  const { account, session, services } = own;

  return handleRequest(async () => {
    await new ManageAccountAvatar(
      services.userAccounts,
      services.photoStorage,
      services.imageProcessor,
    ).remove(account);
    recordAudit(services.auditEvents, session, {
      action: 'update',
      resourceType: 'account',
      resourceId: account.id,
      detail: 'avatar removido',
    });
    return { avatarUrl: null };
  });
}
