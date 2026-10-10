import type { AdminStatus } from '@/application/platform/clinic-overview';
import type { UserAccount } from '@/domain/auth/user-account';
import type { Clinic, ClinicStatus } from '@/domain/clinic/clinic';
import type {
  ChannelTestStatus,
  ClinicChannel,
  EmailProvider,
} from '@/domain/clinic/clinic-channel';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';

/** Dados cadastrais da clínica — cabeçalho/rodapé de documentos emitidos (#61/#62). */
export interface ClinicInfoDto {
  name: string;
  cnpj: string | null;
  address: string | null;
  city: string | null;
  professionalName: string | null;
  professionalRegistry: string | null;
}

export const toClinicInfoDto = (clinic: Clinic): ClinicInfoDto => ({
  name: clinic.name,
  cnpj: clinic.cnpj,
  address: clinic.address,
  city: clinic.city,
  professionalName: clinic.professionalName,
  professionalRegistry: clinic.professionalRegistry,
});

/**
 * Cadastro completo da clínica, com o contato com a plataforma (B4): o que a
 * tela de Configurações e a plataforma editam. Documentos não usam o contato.
 */
export interface ClinicRegistrationDto extends ClinicInfoDto {
  contactPhone: string | null;
  contactEmail: string | null;
}

export const toClinicRegistrationDto = (
  clinic: Clinic,
): ClinicRegistrationDto => ({
  ...toClinicInfoDto(clinic),
  contactPhone: clinic.contactPhone,
  contactEmail: clinic.contactEmail,
});

/** Clínica vista pela plataforma (B4): cadastro, se ele está completo e o estado (B5). */
export interface PlatformClinicDto extends ClinicRegistrationDto {
  id: string;
  registrationComplete: boolean;
  status: ClinicStatus;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  createdAt: string;
}

export const toPlatformClinicDto = (clinic: Clinic): PlatformClinicDto => ({
  id: clinic.id,
  ...toClinicRegistrationDto(clinic),
  registrationComplete: clinic.isRegistrationComplete(),
  status: clinic.status,
  statusChangedAt: clinic.statusChangedAt?.toISOString() ?? null,
  statusChangedBy: clinic.statusChangedBy,
  createdAt: clinic.createdAt.toISOString(),
});

/** Linha da lista de clínicas da plataforma. */
export interface PlatformClinicSummaryDto {
  id: string;
  name: string;
  cnpj: string | null;
  registrationComplete: boolean;
  status: ClinicStatus;
  adminStatus: AdminStatus;
  createdAt: string;
}

export const toPlatformClinicSummaryDto = (
  clinic: Clinic,
  adminStatus: AdminStatus,
): PlatformClinicSummaryDto => ({
  id: clinic.id,
  name: clinic.name,
  cnpj: clinic.cnpj,
  registrationComplete: clinic.isRegistrationComplete(),
  status: clinic.status,
  adminStatus,
  createdAt: clinic.createdAt.toISOString(),
});

/** Admin de Empresa visto pela plataforma — nada além do que ela gere. */
export interface ClinicAdminDto {
  id: string;
  email: string;
  active: boolean;
  passwordSet: boolean;
}

export const toClinicAdminDto = (account: UserAccount): ClinicAdminDto => ({
  id: account.id,
  email: account.email,
  active: account.isActive,
  passwordSet: account.passwordHash !== UNSET_PASSWORD_HASH,
});

/**
 * Canal de e-mail da clínica na tela de Configurações (C3, #266). A chave
 * nunca sai: só os 4 últimos caracteres, para o admin reconhecer qual gravou.
 */
export interface EmailChannelDto {
  provider: EmailProvider;
  sender: string;
  secretLast4: string;
  lastStatus: ChannelTestStatus | null;
  lastStatusAt: string | null;
  lastError: string | null;
}

export const toEmailChannelDto = (channel: ClinicChannel): EmailChannelDto => ({
  provider: channel.provider,
  sender: channel.sender,
  secretLast4: channel.secretLast4,
  lastStatus: channel.lastStatus,
  lastStatusAt: channel.lastStatusAt?.toISOString() ?? null,
  lastError: channel.lastError,
});
