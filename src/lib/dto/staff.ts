import type { UserRole } from '@/domain/auth/user-role';
/** Identidade da sessão ativa exibida na sidebar (issue #126) — `account` é `null` só em modo aberto (sem sessão real). */
export interface SidebarIdentityDto {
  clinicLabel: string;
  /** `role` permite à UI escolher a visão (ex.: repasses da clínica × próprios). */
  account: { email: string; role: UserRole; roleLabel: string } | null;
}

/** Status da conexão do Google Agenda da clínica (issue #124) — `email`/`connectedAt` são `null` quando `connected` é `false`. */
export interface CalendarIntegrationStatusDto {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}
