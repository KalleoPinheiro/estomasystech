/**
 * Prova do corte da release (ADR-088): o `release:cut` prova o SHA final da release com o gate completo e
 * grava, nesse SHA, o check run `release-cut/gate`. O PR `release/* → main` e o push do merge na `main`
 * conferem o selo e a igualdade de árvore em vez de repetir o que o corte já provou. Tudo aqui falha fechado:
 * qualquer dúvida devolve `provado: false` e o CI roda inteiro.
 */

/** Nome do check run que o corte grava no SHA provado. */
export const SELO_NOME = 'release-cut/gate';

/** Só um GitHub App cria check run; o `GITHUB_TOKEN` do Actions é da app `github-actions`. PAT não cria. */
export const SELO_APP = 'github-actions';

/** Etapas que o `ci.yml` pesado repetiria (typecheck, lint, sv, docs, cobertura, build) mais a integração. */
export const ETAPAS_CI = ['typecheck', 'lint', 'sv', 'docs', 'cobertura', 'build', 'integracao'] as const;

/** Etapas que o `docker.yml` repetiria. */
export const ETAPAS_DOCKER = ['docker', 'backup'] as const;

export interface CheckRunLite {
  name: string;
  conclusion: string | null;
  head_sha: string;
  app?: { slug?: string | null } | null;
  output?: { summary?: string | null } | null;
}

export interface ProvaInput {
  /** `pull_request` ou `push`; qualquer outro evento roda tudo. */
  evento: string;
  /** PR: branch de destino. Push: branch que recebeu o push. Só a `main` pode ser dispensada. */
  baseRef: string;
  /** PR: branch de origem (precisa ser `release/v*`). Push: ignorado. */
  headRef: string;
  /** SHA do head do PR informado pelo evento (vazio no push). */
  headShaEvento: string;
  /** Segundo pai do commit em teste (head da release); vazio se não for commit de merge. */
  segundoPai: string;
  arvoreCommit: string;
  arvoreSegundoPai: string;
  checkRuns: readonly CheckRunLite[];
  etapasExigidas: readonly string[];
}

export type Prova = { provado: boolean; motivo: string };

const RELEASE_DE_VERSAO = /^release\/v\d+\.\d+\.\d+/;

const recusa = (motivo: string): Prova => ({ provado: false, motivo });

/** `etapas=a,b,c` de um resumo de check run ou da linha `E2E-GATE:`; vazio se ausente. */
export function etapasDoResumo(summary: string | null | undefined): string[] {
  const m = /(?:^|\s)etapas=(\S+)/.exec(summary ?? '');
  return m ? (m[1] ?? '').split(',').filter(Boolean) : [];
}

export function avaliarProva(i: ProvaInput): Prova {
  if (i.evento === 'pull_request') {
    if (i.baseRef !== 'main') return recusa('PR que não vai para a main');
    if (!RELEASE_DE_VERSAO.test(i.headRef)) return recusa('PR que não vem de release/vX.Y.Z');
  } else if (i.evento === 'push') {
    if (i.baseRef !== 'main') return recusa('push fora da main');
  } else {
    return recusa(`evento ${i.evento} não é dispensável`);
  }
  if (i.segundoPai === '') return recusa('o commit em teste não é um merge commit');
  if (i.headShaEvento !== '' && i.headShaEvento !== i.segundoPai)
    return recusa('o head do PR não é o segundo pai do merge em teste');
  if (i.arvoreCommit === '' || i.arvoreCommit !== i.arvoreSegundoPai)
    return recusa('a árvore em teste difere da árvore provada pelo corte');

  const selo = i.checkRuns.find(
    (c) =>
      c.name === SELO_NOME &&
      c.app?.slug === SELO_APP &&
      c.head_sha === i.segundoPai &&
      c.conclusion === 'success',
  );
  if (!selo) return recusa(`sem o check run ${SELO_NOME} (app ${SELO_APP}, success) no SHA ${i.segundoPai.slice(0, 7)}`);

  const feitas = etapasDoResumo(selo.output?.summary);
  const faltam = i.etapasExigidas.filter((e) => !feitas.includes(e));
  if (faltam.length > 0) return recusa(`o selo não cobre as etapas: ${faltam.join(', ')}`);
  return { provado: true, motivo: `provado pelo corte no SHA ${i.segundoPai.slice(0, 7)} (árvore idêntica)` };
}

const LINHA_RECIBO = /^E2E-GATE:[ \t]+([0-9a-f]{40})[ \t]+(pass|fail)[ \t]+(.*)$/m;

export interface Selo {
  sha: string;
  etapas: string[];
}

/** Lê a linha `E2E-GATE:` do corpo do PR; só recibo `pass` com etapas vira selo. */
export function seloDoRecibo(texto: string, extras: readonly string[]): Selo | null {
  const m = LINHA_RECIBO.exec(texto);
  if (!m || m[2] !== 'pass') return null;
  const etapas = etapasDoResumo(m[3]);
  if (etapas.length === 0) return null;
  return { sha: m[1] ?? '', etapas: [...etapas, ...extras.filter((e) => !etapas.includes(e))] };
}

export function resumoDoSelo(selo: Selo): string {
  return `${SELO_NOME} sha=${selo.sha} etapas=${selo.etapas.join(',')}`;
}
