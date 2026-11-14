/**
 * Posse mecânica de issue entre os dois agentes (ADR-104, emenda ao ADR-103). Regras puras: o agente que escreveu o
 * PR (branch e trailers dos commits) precisa ser o dono (`dono:claude` ou `dono:cursor`) de cada issue que o PR fecha.
 */

export type Agente = 'claude' | 'cursor';
export const AGENTES: readonly Agente[] = ['claude', 'cursor'];
export const PREFIXO_DONO = 'dono:';
export const VAGAS_GLOBAIS = 3;

const FECHA_ISSUE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi;
const TRAILER_CLAUDE = /^co-authored-by:\s*claude\b/im;
const TRAILER_CURSOR = /^co-authored-by:\s*cursor agent\b/im;
/** PR de integração (release, sync da main, dependabot) não nasce de uma issue de um agente. */
const SEM_POSSE = /^(release\/|sync\/|chore\/sync|hotfix\/|dependabot\/)/;

export const agenteDaBranch = (branch: string): Agente | null => {
  if (branch.startsWith('claude/')) return 'claude';
  if (branch.startsWith('cursor/')) return 'cursor';
  return null;
};

export const agentesDosCommits = (mensagens: readonly string[]): Agente[] => {
  const achados = new Set<Agente>();
  for (const m of mensagens) {
    if (TRAILER_CLAUDE.test(m)) achados.add('claude');
    if (TRAILER_CURSOR.test(m)) achados.add('cursor');
  }
  return [...achados];
};

/** Números das issues que o corpo do PR fecha (`Closes #N`, `Fixes #N`, `Resolves #N`). */
export const issuesFechadas = (corpo: string): number[] => {
  const numeros = [...corpo.matchAll(FECHA_ISSUE)].map((m) => Number(m[1]));
  return [...new Set(numeros)];
};

/** Referência no título, `(#N)`: PR aberto antes do ADR-104 (ex.: #811) ainda não traz `Closes` no corpo. */
const REFERENCIA_NO_TITULO = /\(#(\d+)\)/g;

/** Issues do PR: as que o corpo fecha e as que o título referencia. */
export const issuesDoPr = (corpo: string, titulo = ''): number[] => {
  const doTitulo = [...titulo.matchAll(REFERENCIA_NO_TITULO)].map((m) => Number(m[1]));
  return [...new Set([...issuesFechadas(corpo), ...doTitulo])];
};

export const donosDasLabels = (labels: readonly string[]): string[] =>
  labels.filter((l) => l.startsWith(PREFIXO_DONO)).map((l) => l.slice(PREFIXO_DONO.length));

export type EntradaPosse = {
  branch: string;
  corpo: string;
  titulo?: string;
  mensagensDosCommits: readonly string[];
  /** Labels de cada issue citada, já lidas da API. */
  labelsPorIssue: ReadonlyMap<number, readonly string[]>;
};

export type ResultadoPosse = { ok: boolean; aplicavel: boolean; motivos: string[] };

const motivoDaIssue = (issue: number, agente: Agente, labels: readonly string[] | undefined): string | null => {
  const donos = donosDasLabels(labels ?? []);
  if (donos.length !== 1) return `#${issue} precisa ter exatamente uma label dono:* (tem ${donos.length}).`;
  if (donos[0] !== agente) return `#${issue} é dono:${donos[0]}, mas o PR foi escrito por ${agente}.`;
  return null;
};

export function avaliarPosse(e: EntradaPosse): ResultadoPosse {
  if (SEM_POSSE.test(e.branch)) return { ok: true, aplicavel: false, motivos: [] };
  const agentes = new Set<Agente>(agentesDosCommits(e.mensagensDosCommits));
  const daBranch = agenteDaBranch(e.branch);
  if (daBranch) agentes.add(daBranch);
  if (agentes.size === 0) {
    return { ok: false, aplicavel: true, motivos: ['nenhum agente identificado: os commits do PR precisam do trailer `Co-Authored-By: Claude` ou `Co-authored-by: Cursor Agent` (falha fechada).'] };
  }
  if (agentes.size > 1) {
    return { ok: false, aplicavel: true, motivos: ['mais de um agente escreveu neste PR (branch e commits). Branch por agente; ninguém empurra na branch do outro.'] };
  }
  const [agente] = [...agentes] as [Agente];
  const issues = issuesDoPr(e.corpo, e.titulo);
  if (issues.length === 0) {
    return { ok: false, aplicavel: true, motivos: ['o corpo do PR precisa de `Closes #N` (ou o título de `(#N)`) apontando para a issue do trabalho.'] };
  }
  const motivos = issues
    .map((n) => motivoDaIssue(n, agente, e.labelsPorIssue.get(n)))
    .filter((m): m is string => m !== null);
  return { ok: motivos.length === 0, aplicavel: true, motivos };
}

export type ItemEstado = { numero: number; titulo: string; labels: readonly string[]; rascunho?: boolean };

const linha = (i: ItemEstado): string => `- #${i.numero} ${i.titulo}${i.rascunho ? ' (rascunho)' : ''}`;

const porDono = (itens: readonly ItemEstado[], dono: string | null): ItemEstado[] =>
  itens.filter((i) => {
    const d = donosDasLabels(i.labels);
    return dono === null ? d.length !== 1 : d.length === 1 && d[0] === dono;
  });

/** Estado legível pelos dois agentes (`npm run estado`): quem é dono de quê e quantas vagas estão ocupadas. */
export function renderEstado(release: string, issues: readonly ItemEstado[], prs: readonly ItemEstado[]): string {
  const ocupadas = issues.filter((i) => i.labels.includes('em-andamento'));
  const blocos: string[] = [`# Estado da release ${release}`, ''];
  blocos.push(`Vagas de código ocupadas (label \`em-andamento\`): ${ocupadas.length}/${VAGAS_GLOBAIS}${ocupadas.length > VAGAS_GLOBAIS ? ' **ACIMA DO TETO**' : ''}`, '');
  for (const dono of AGENTES) {
    blocos.push(`## Issues de ${dono}`, ...porDono(issues, dono).map(linha), '');
  }
  blocos.push('## Issues sem dono único (resolver antes de iniciar)', ...porDono(issues, null).map(linha), '');
  blocos.push('## PRs abertos', ...prs.map(linha), '');
  return `${blocos.join('\n')}\n`;
}
