import { after, type NextRequest } from 'next/server';
import { z } from 'zod';
import { IssueAuthToken } from '@/application/auth/auth-token-flow';
import { appUrlFromEnv } from '@/application/auth/send-invite';
import type { UserAccount } from '@/domain/auth/user-account';
import { getRepositories } from '@/infrastructure/container';
import { fail, ok } from '@/lib/api-response';
import { clientIp } from '@/lib/auth/client-ip';
import { SharedRateLimiter } from '@/lib/auth/rate-limit';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { logError } from '@/lib/log-error';

/** Mesmo limite do login: a rota é um oráculo em potencial se puder ser martelada. */
const FORGOT_RATE_LIMIT = new SharedRateLimiter('forgot-password', 5, 60_000);

const schema = z.object({
  email: z.string().min(3).max(200),
});

/**
 * Resposta única, sempre a mesma: conta existente, inexistente ou desativada
 * produzem exatamente este corpo. Qualquer diferença (status, texto, tempo de
 * resposta perceptível) transformaria a rota num verificador de e-mails.
 */
const NEUTRAL_RESPONSE = {
  message:
    'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.',
};

export async function POST(request: NextRequest) {
  if (!(await FORGOT_RATE_LIMIT.allow(clientIp(request)))) {
    return fail('Muitas tentativas, aguarde um minuto', 429);
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return ok(NEUTRAL_RESPONSE);
  }

  // Deliberadamente FORA do caminho da resposta: aguardar a emissão + o POST ao
  // provedor deixaria a resposta do caso "conta existe" mensuravelmente mais
  // lenta que a do caso "não existe", e o corpo idêntico não adiantaria nada —
  // o relógio viraria o oráculo (CWE-204).
  //
  // `after` em vez de um `void promise` solto: só ele registra a tarefa no
  // ciclo de vida do Next. Com `void`, um runtime serverless pode encerrar a
  // invocação assim que a resposta sai e matar a emissão no meio — o pedido
  // seria aceito e o e-mail nunca sairia.
  after(() => issueResetLink(parsed.data.email));

  return ok(NEUTRAL_RESPONSE);
}

async function issueResetLink(email: string): Promise<void> {
  try {
    // clinicId nulo: quem pede o reset não tem sessão, logo não há empresa
    // de contexto — a busca da conta é cross-empresa.
    const { userAccounts } = await getRepositories(systemScope());
    // MT-06/ADR-003 permite o mesmo e-mail em clínicas diferentes. Sem senha
    // pra desambiguar (diferente do login, issue #125), emite um link por
    // conta ativa correspondente: cada e-mail resolve a sua própria conta.
    const accounts = (await userAccounts.findAllByEmail(email)).filter(
      (account) => account.isActive,
    );
    await Promise.all(accounts.map(issueThroughAccountChannel));
  } catch (error) {
    logError('Reset de senha: falha ao emitir o link', error);
  }
}

/**
 * Cada conta sai pelo canal da própria clínica; o super admin, pelo da
 * plataforma (C2, #265). Clínica sem canal não envia nada, e a resposta
 * neutra não muda.
 */
async function issueThroughAccountChannel(account: UserAccount): Promise<void> {
  const { authTokens, email } = await getRepositories(
    account.clinicId === null ? systemScope() : clinicScope(account.clinicId),
  );
  await new IssueAuthToken(authTokens, email).execute({
    account,
    purpose: 'reset',
    appUrl: appUrlFromEnv(),
  });
}
