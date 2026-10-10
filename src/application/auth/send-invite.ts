import type { EmailGateway } from '@/application/ports/email-gateway';
import type {
  AuthTokenPurpose,
  AuthTokenRepository,
} from '@/domain/auth/auth-token';
import type { UserAccount } from '@/domain/auth/user-account';
import { IssueAuthToken } from './auth-token-flow';

export interface InviteServices {
  authTokens: AuthTokenRepository;
  email: EmailGateway;
}

const DEV_APP_URL = 'http://localhost:3000';

/**
 * Base pública da aplicação, usada para montar os links de convite e reset.
 *
 * Em produção é obrigatória e precisa ser HTTPS: o link carrega um segredo de
 * uso único que concede a definição da senha da conta — em `http://` ele
 * trafega em claro, e com `APP_URL` ausente apontaria para `localhost`, o que
 * manda toda a instalação para um link inútil. Falha fechado, como o resto da
 * configuração de autenticação.
 */
export const appUrlFromEnv = (): string => {
  const configured = process.env.APP_URL;
  if (process.env.NODE_ENV !== 'production') {
    return configured ?? DEV_APP_URL;
  }
  if (!configured || !isSafeOrigin(configured)) {
    throw new Error(
      'APP_URL precisa ser uma URL https:// em produção — os links de convite e ' +
        'de reset de senha carregam um segredo de uso único',
    );
  }
  return configured;
};

/**
 * `https://` sempre; `http://` só para loopback, que é a imagem de produção
 * rodando na própria máquina (docker compose local) — ali o segredo não sai do
 * host, e exigir TLS tornaria o quick-start impossível.
 */
export const isSafeOrigin = (url: string): boolean => {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === 'https:') {
      return true;
    }
    return (
      protocol === 'http:' &&
      (hostname === 'localhost' || hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
};

/**
 * Resultado de uma emissão feita por alguém logado (C2, #265): o link só volta
 * quando o e-mail não saiu — clínica sem canal ou canal que falhou. Com o
 * e-mail entregue, devolvê-lo exporia uma credencial sem necessidade.
 */
export interface AccessLinkResult {
  delivered: boolean;
  inviteUrl: string | null;
}

/**
 * Emite o link de convite ou redefinição e tenta enviá-lo pelo canal do escopo
 * dos serviços, sem deixar a falha de envio perder o link nem desfazer o que
 * o chamador já gravou.
 */
export async function issueAccessLink(
  services: InviteServices,
  account: UserAccount,
  purpose: AuthTokenPurpose,
): Promise<AccessLinkResult> {
  const { inviteUrl, delivered } = await new IssueAuthToken(
    services.authTokens,
    services.email,
  ).issueAndTryDeliver({ account, purpose, appUrl: appUrlFromEnv() });
  return { delivered, inviteUrl: delivered ? null : inviteUrl };
}

/**
 * Dispara o convite de primeiro acesso sem deixar a indisponibilidade do
 * provedor de e-mail derrubar o cadastro: a conta permanece criada e o convite
 * pode ser reemitido (`POST /api/accounts/[id]/resend-invite`). Quando o
 * e-mail não sai, o link volta para quem cadastrou (C2, #265).
 */
export function sendInvite(
  services: InviteServices,
  account: UserAccount,
): Promise<AccessLinkResult> {
  return issueAccessLink(services, account, 'invite');
}
