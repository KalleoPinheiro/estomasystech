import type { UserRole } from '@/domain/auth/user-role';
/** Identidade da sessão ativa exibida na sidebar (issue #126) — `account` é `null` só em modo aberto (sem sessão real). */
export interface SidebarIdentityDto {
  clinicLabel: string;
  /** `role` permite à UI escolher a visão (ex.: repasses da clínica × próprios). */
  /** `professionalId`: vínculo da conta, para a UI limitar o Profissional ao que é dele (#215). */
  account: {
    email: string;
    role: UserRole;
    roleLabel: string;
    professionalId: string | null;
  } | null;
}

/** Status da conexão do Google Agenda da clínica (issue #124) — `email`/`connectedAt` são `null` quando `connected` é `false`. */
export interface CalendarIntegrationStatusDto {
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
}
