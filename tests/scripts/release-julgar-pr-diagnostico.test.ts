import { describe, expect, it } from 'vitest';
import {
  claimsNaoSecretas,
  trocarTokenOidc,
} from '../../scripts/release/julgar-pr-lib';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'RS256' })}.${b64({
  iss: 'https://token.actions.githubusercontent.com',
  sub: 'repo:KalleoPinheiro/estomasystech:pull_request',
  aud: 'https://api.anthropic.com',
  event_name: 'pull_request_target',
  repository: 'KalleoPinheiro/estomasystech',
  job_workflow_ref:
    'KalleoPinheiro/estomasystech/.github/workflows/veredito-judge.yml@refs/heads/main',
  actor: 'segredo-nao-listado',
})}.assinatura`;
const cfg = { regra: 'fdrl_1', organizacao: 'org-1', contaDeServico: 'svac_1' };

describe('diagnóstico da troca do token OIDC', () => {
  it('Dado um JWT, Quando extrai as claims, Então devolve só as seis não secretas', () => {
    const c = claimsNaoSecretas(jwt);
    expect(Object.keys(c).sort()).toEqual([
      'aud',
      'event_name',
      'iss',
      'job_workflow_ref',
      'repository',
      'sub',
    ]);
    expect(claimsNaoSecretas('lixo')).toEqual({});
  });

  it('Dado 401 da API, Quando troca, Então o erro traz o corpo da resposta e as claims, sem o JWT', async () => {
    const buscar = (async () => ({
      ok: false,
      status: 401,
      text: async () => `{"error":"invalid_grant","assertion":"${jwt}"}`,
    })) as unknown as typeof fetch;
    const erro = await trocarTokenOidc(jwt, cfg, buscar).catch(
      (e: Error) => e.message,
    );
    expect(erro).toContain('HTTP 401');
    expect(erro).toContain('invalid_grant');
    expect(erro).toContain('repo:KalleoPinheiro/estomasystech:pull_request');
    expect(erro).not.toContain(jwt);
    expect(erro).not.toContain('segredo-nao-listado');
  });
});
