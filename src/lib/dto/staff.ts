import type { UserRole } from '@/domain/auth/user-role';
import type { ClinicTheme } from '@/domain/clinic/clinic-identity';
/** Identidade da sessão ativa exibida na sidebar (issue #126) — `account` é sempre a conta da sessão. */
export interface SidebarIdentityDto {
  clinicLabel: string;
  /** Logo da clínica (#427); ausente ou `null` = iniciais. */
  clinicLogoUrl?: string | null;
  /** Tema da clínica (#426); ausente = o padrão (segue o aparelho, violeta). */
  clinicTheme?: ClinicTheme;
  /** `role` permite à UI escolher a visão (ex.: repasses da clínica × próprios). */
  /** `professionalId`: vínculo da conta, para a UI limitar o Profissional ao que é dele (#215). */
  account: {
    email: string;
    role: UserRole;
    roleLabel: string;
    professionalId: string | null;
    /** Avatar da conta (#427); ausente ou `null` = iniciais. */
    avatarUrl?: string | null;
  };
}

/** Status da conexão do Google Agenda da clínica (issue #124) — `email`/`connectedAt` são `null` quando `connected` é `false`. */
export interface CalendarIntegrationStatusDto {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}
