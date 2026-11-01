/**
 * Selo do corte (ADR-088): grava o check run `release-cut/gate` no SHA que o gate da release provou. Só roda
 * com `SELO_TOKEN` (o `GITHUB_TOKEN` do Actions, da app `github-actions`); PAT não cria check run e é por isso
 * que o `GH_TOKEN` do corte (PAT do dono) não serve aqui. Sem o token (corte local) não faz nada.
 */
import { spawnSync } from 'node:child_process';
import { resumoDoSelo, SELO_NOME, type Selo, seloDoRecibo } from './prova-corte-lib';

export type Gh = (args: readonly string[], token: string) => { ok: boolean; out: string };

const ghReal: Gh = (args, token) => {
  const r = spawnSync('gh', [...args], { encoding: 'utf8', env: { ...process.env, GH_TOKEN: token } });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};

export type Selagem = { feita: boolean; motivo: string };

export function selarCorte(
  input: { recibo: string; extras: readonly string[]; token: string; repo: string },
  gh: Gh = ghReal,
): Selagem {
  if (input.token === '') return { feita: false, motivo: 'sem SELO_TOKEN (corte local): selo não gravado' };
  const selo: Selo | null = seloDoRecibo(input.recibo, input.extras);
  if (selo === null) return { feita: false, motivo: 'recibo ausente, falho ou sem etapas: selo não gravado' };
  const r = gh(
    [
      'api',
      '-X',
      'POST',
      `repos/${input.repo}/check-runs`,
      '-f',
      `name=${SELO_NOME}`,
      '-f',
      `head_sha=${selo.sha}`,
      '-f',
      'status=completed',
      '-f',
      'conclusion=success',
      '-f',
      'output[title]=Gate completo da release provou este SHA',
      '-f',
      `output[summary]=${resumoDoSelo(selo)}`,
    ],
    input.token,
  );
  return r.ok
    ? { feita: true, motivo: resumoDoSelo(selo) }
    : { feita: false, motivo: `a API recusou o selo: ${r.out.split('\n')[0]}` };
}
