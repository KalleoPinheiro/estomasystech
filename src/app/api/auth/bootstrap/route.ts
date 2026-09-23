import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { IssueAuthToken } from '@/application/auth/auth-token-flow';
import { appUrlFromEnv } from '@/application/auth/send-invite';
import { UserAccount } from '@/domain/auth/user-account';
import { ProvisioningDeniedError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { clientIp } from '@/lib/auth/client-ip';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { RateLimiter } from '@/lib/auth/rate-limit';
import { passwordMatches } from '@/lib/auth/session';
import { systemScope } from '@/lib/auth/tenant-scope';
import { isUniqueViolation } from '@/lib/db-errors';

const BOOTSTRAP_RATE_LIMIT = new RateLimiter(5, 60_000);

export const BOOTSTRAP_TOKEN_HEADER = 'x-bootstrap-token';
/** Mensagem única para segredo errado e para instalação já inicializada. */
export const BOOTSTRAP_UNAVAILABLE_MESSAGE = 'Bootstrap indisponível';

const schema = z.object({
  email: z.string().min(3).max(200),
});

function hasValidBootstrapToken(request: NextRequest): boolean {
  const expected = process.env.VITTA_BOOTSTRAP_TOKEN;
  const provided = request.headers.get(BOOTSTRAP_TOKEN_HEADER);
  // `passwordMatches` é a comparação em tempo constante do projeto — o nome vem
  // do primeiro uso (senha), mas o contrato é "compara dois segredos".
  if (!expected || !provided) {
    return false;
  }
  return passwordMatches(expected, provided);
}

/**
 * Cria a PRIMEIRA conta Super Admin de uma instalação nova. Sem allowlist e
 * sem senha mestre, é o único caminho de primeiro acesso — e por isso tem duas
 * guardas independentes:
 *
 *  1. `VITTA_BOOTSTRAP_TOKEN` (header `x-bootstrap-token`) — segredo de deploy;
 *     ausente ou incorreto, a rota não faz nada. Fail-closed.
 *  2. Zero contas na instalação — depois da primeira conta a rota deixa de
 *     funcionar para sempre, mesmo com o segredo correto.
 *
 * A conta nasce sem senha usável: quem define a senha é a própria pessoa, pelo
 * convite enviado por e-mail — igual a qualquer outra conta.
 */
export async function POST(request: NextRequest) {
  if (!BOOTSTRAP_RATE_LIMIT.allow(clientIp(request))) {
    return fail('Muitas tentativas, aguarde um minuto', 429);
  }
  if (!hasValidBootstrapToken(request)) {
    return fail(BOOTSTRAP_UNAVAILABLE_MESSAGE, 403);
  }

  // clinicId nulo: o Super Admin é papel de sistema, sem empresa própria.
  const services = await getRepositories(systemScope());
  if (await services.userAccounts.hasAnyAccount()) {
    return fail(BOOTSTRAP_UNAVAILABLE_MESSAGE, 403);
  }

  return handleRequest(async () => {
    const body = schema.parse(await request.json());
    const account = UserAccount.create({
      email: body.email,
      passwordHash: UNSET_PASSWORD_HASH,
      role: 'super_admin',
      clinicId: null,
    });
    // O link é montado ANTES de criar a conta: se `APP_URL` estiver inválida em
    // produção, falhar aqui evita gravar a conta que trava o bootstrap para
    // sempre sem que ninguém consiga o link dela.
    const appUrl = appUrlFromEnv();
    // Corrida: hasAnyAccount() acima é só um atalho — a guarda de verdade é o
    // índice único parcial `uq_user_accounts_single_system_account`
    // (issue #51). Duas requisições concorrentes numa instalação vazia
    // passam as duas pela checagem; só uma consegue gravar, a outra esbarra
    // no índice e recebe a mesma mensagem genérica.
    try {
      await services.userAccounts.save(account);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProvisioningDeniedError(BOOTSTRAP_UNAVAILABLE_MESSAGE);
      }
      throw error;
    }

    // Uma falha de envio não pode derrubar o bootstrap: a conta já existe e a
    // rota é de uso único, então um 500 aqui deixaria a instalação sem nenhum
    // caminho de primeiro acesso.
    const { inviteUrl, delivered } = await new IssueAuthToken(
      services.authTokens,
      services.email,
    ).issueAndTryDeliver({ account, purpose: 'invite', appUrl });

    return {
      email: account.email,
      role: account.role,
      // Devolvido quando o link não chega por e-mail — sem canal configurado
      // (dev, testes) ou envio falhado. Quem chama já detém o segredo de deploy.
      inviteUrl: delivered ? null : inviteUrl,
    };
  });
}
