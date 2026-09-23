import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  ConsumeAuthToken,
  MIN_PASSWORD_LENGTH,
} from '@/application/auth/auth-token-flow';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { clientIp } from '@/lib/auth/client-ip';
import { RateLimiter } from '@/lib/auth/rate-limit';
import { systemScope } from '@/lib/auth/tenant-scope';

/** Mesmo limite do login: adivinhar um token é força bruta como qualquer outra. */
const SET_PASSWORD_RATE_LIMIT = new RateLimiter(5, 60_000);

const schema = z.object({
  token: z.string().min(1).max(400),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

/**
 * Define a senha a partir de um link de convite ou de reset. Rota pública por
 * natureza: quem a usa ainda não tem sessão — a autorização é o token de uso
 * único, não um cookie.
 */
export async function POST(request: NextRequest) {
  if (!SET_PASSWORD_RATE_LIMIT.allow(clientIp(request))) {
    return fail('Muitas tentativas, aguarde um minuto', 429);
  }

  return handleRequest(async () => {
    const body = schema.parse(await request.json());
    // clinicId nulo: o consumo acontece antes da sessão, sem empresa de contexto.
    const { authTokens, userAccounts, auditEvents } = await getRepositories(
      systemScope(),
    );
    const result = await new ConsumeAuthToken(authTokens, userAccounts).execute(
      {
        secret: body.token,
        newPassword: body.password,
        // Esta rota é o único consumidor hoje e aceita convite e reset —
        // ambos têm o mesmo poder de efeito (definir/redefinir senha).
        expectedPurposes: ['invite', 'reset'],
      },
    );
    // Ator explícito pré-sessão: quem teve a senha alterada (AC-07). A senha já
    // foi trocada e o token já foi consumido (uso único) — uma falha aqui não
    // pode virar erro pro usuário: a ação já é irreversível e não há como pedir
    // retry (o token não existe mais). Loga alto e segue.
    try {
      await recordAuditNow(auditEvents, null, {
        action: 'update',
        resourceType: 'account-password',
        resourceId: result.accountId,
        detail: result.purpose,
        actorOverride: {
          role: result.role,
          id: result.email,
          clinicId: result.clinicId,
        },
      });
    } catch (error) {
      console.error(
        'Auditoria: falha ao registrar definição/reset de senha',
        error,
      );
    }
    return { ok: true };
  });
}
