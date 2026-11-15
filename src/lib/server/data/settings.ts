import 'server-only';
import { ManageEmailChannel } from '@/application/clinic/manage-email-channel';
import { visibleAccounts } from '@/domain/auth/account-management';
import { mfaPolicy } from '@/domain/auth/mfa';
import type { UserAccount } from '@/domain/auth/user-account';
import { DEFAULT_SCHEDULE_CONFIG } from '@/domain/scheduling/schedule-config';
import { getRepositories } from '@/infrastructure/container';
import { isPhotoStorageAvailable } from '@/infrastructure/storage/unavailable-photo-storage';
import { accountManager } from '@/lib/auth/account-manager';
import { googleCalendarOAuthConfigFromEnv } from '@/lib/auth/google-calendar-oauth';
import type { Session } from '@/lib/auth/session';
import {
  clinicScope,
  sessionScope,
  writeClinicId,
  writeScope,
} from '@/lib/auth/tenant-scope';
import {
  accountAvatarUrl,
  type CalendarIntegrationStatusDto,
  clinicLogoUrl,
  type EmailChannelDto,
  toClinicRegistrationDto,
  toEmailChannelDto,
  toUserAccountDto,
} from '@/lib/dto';

/**
 * Dados das seções de Configurações e de Minha conta (#557, ADR-074): cada
 * função devolve a MESMA resposta da rota de API de mesmo assunto, que passa a
 * chamá-la. O papel já foi decidido por quem chama (guarda da tela ou da rota).
 */

/** `GET /api/settings/clinic-info`: cadastro da clínica e a logo (#427). */
export async function loadClinicSettings(session: Session) {
  const clinicId = writeClinicId(session);
  const { clinics, photoStorage } = await getRepositories(
    clinicScope(clinicId),
  );
  const clinic = await clinics.findById(clinicId);
  if (!clinic) {
    throw new Error('Clínica não encontrada');
  }
  return {
    info: toClinicRegistrationDto(clinic),
    identity: {
      logoUrl: clinicLogoUrl(clinic.logoKey),
      theme: clinic.theme,
      imageUploadAvailable: isPhotoStorageAvailable(photoStorage),
    },
  };
}

/** `GET /api/settings/schedule`: grade da clínica (padrão quando nada foi salvo). */
export async function loadScheduleSettings(session: Session) {
  const { scheduleConfig } = await getRepositories(writeScope(session));
  const config = await scheduleConfig.get();
  return {
    config: config ?? DEFAULT_SCHEDULE_CONFIG,
    isDefault: config === null,
  };
}

/** `GET /api/settings/email-channel`: `{ channel: null }` sem canal (C3). */
export async function loadEmailChannel(
  session: Session,
): Promise<{ channel: EmailChannelDto | null }> {
  const clinicId = writeClinicId(session);
  const { clinicChannels, email } = await getRepositories(writeScope(session));
  const channel = await new ManageEmailChannel(
    clinicChannels,
    email,
    clinicId,
  ).find();
  return { channel: channel ? toEmailChannelDto(channel) : null };
}

/** `GET /api/accounts`: contas que o papel da sessão enxerga (#184). */
export async function listAccountsFor(session: Session) {
  const { userAccounts } = await getRepositories(sessionScope(session));
  const accounts = await userAccounts.findAll();
  const { role } = accountManager(session);
  return visibleAccounts(role, accounts).map(toUserAccountDto);
}

/** `GET /api/settings/calendar-integration`: status do Google Agenda (#124). */
export async function loadCalendarStatus(
  session: Session,
): Promise<CalendarIntegrationStatusDto> {
  const { googleAccounts } = await getRepositories(sessionScope(session));
  const account = await googleAccounts.findMostRecent();
  const configured = googleCalendarOAuthConfigFromEnv() !== null;
  return account
    ? {
        configured,
        connected: true,
        email: account.email,
        connectedAt: account.connectedAt.toISOString(),
      }
    : { configured, connected: false, email: null, connectedAt: null };
}

/**
 * `GET /api/me`: e-mail, papel e segundo fator da conta (#295). As chaves de
 * foto só aparecem quando há o que dizer (#427).
 */
export async function loadOwnAccountView(session: Session) {
  const services = await getRepositories(sessionScope(session));
  const account = await services.userAccounts.findByEmail(session.subject);
  if (!account?.isActive) return null;
  return ownAccountView(account, services);
}

type Services = Awaited<ReturnType<typeof getRepositories>>;

export async function ownAccountView(account: UserAccount, services: Services) {
  const factor = await services.mfa.findFactor(account.id);
  const avatarUrl = accountAvatarUrl(account.id, account.avatarKey);
  return {
    email: account.email,
    role: account.role,
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(isPhotoStorageAvailable(services.photoStorage)
      ? {}
      : { imageUploadAvailable: false }),
    mfa: { policy: mfaPolicy(account.role), enrolled: factor !== null },
  };
}
