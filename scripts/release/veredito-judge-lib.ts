/**
 * Regras puras do `npm run check:veredito`: veredito estruturado do the-judge como check (ADR-097).
 *
 * O the-judge é LLM e não é determinístico, então fica **acima** do piso mecânico, nunca no lugar dele. O que
 * é determinístico aqui é o contrato: o JSON `the-judge/v1` tem de ser válido, ser do SHA atual da PR, vir de
 * quem não escreveu a PR e não ter achado bloqueante. Tudo falha fechado. Sem git, sem disco e sem rede; a
 * casca está em `veredito-judge.ts`.
 */

export const SCHEMA_VEREDITO = 'the-judge/v1';

export const SEVERIDADES = ['bloqueante', 'importante', 'sugestao'] as const;
export type Severidade = (typeof SEVERIDADES)[number];

export interface Achado {
  severidade: Severidade;
  titulo: string;
  arquivo?: string;
  linha?: number;
  detalhe?: string;
}

export interface Veredito {
  schema: typeof SCHEMA_VEREDITO;
  /** SHA completo (40 hex) do commit revisado. Veredito de outro SHA não vale. */
  sha: string;
  /** Identificador de quem escreveu a PR (login, sessão ou thread). Opaco: só é comparado com o do revisor. */
  autor: string;
  /** Identificador de quem revisou. Tem de ser diferente do autor. */
  revisor: string;
  achados: Achado[];
  resumo?: string;
}

export type LeituraVeredito = { ok: true; veredito: Veredito } | { ok: false; erro: string };

const SHA = /^[0-9a-f]{40}$/;
const texto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const registro = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function lerAchado(bruto: unknown, i: number): { achado: Achado } | { erro: string } {
  if (!registro(bruto)) return { erro: `achados[${i}] não é um objeto` };
  if (!SEVERIDADES.includes(bruto.severidade as Severidade)) {
    return { erro: `achados[${i}].severidade inválida (use ${SEVERIDADES.join(', ')})` };
  }
  if (!texto(bruto.titulo)) return { erro: `achados[${i}].titulo ausente` };
  const achado: Achado = { severidade: bruto.severidade as Severidade, titulo: bruto.titulo };
  if (typeof bruto.arquivo === 'string') achado.arquivo = bruto.arquivo;
  if (typeof bruto.linha === 'number') achado.linha = bruto.linha;
  if (typeof bruto.detalhe === 'string') achado.detalhe = bruto.detalhe;
  return { achado };
}

/** Valida a forma do veredito. Qualquer desvio é erro: o check nunca "adivinha" o que o the-judge quis dizer. */
export function lerVeredito(bruto: unknown): LeituraVeredito {
  if (!registro(bruto)) return { ok: false, erro: 'veredito não é um objeto JSON' };
  if (bruto.schema !== SCHEMA_VEREDITO) return { ok: false, erro: `schema deve ser "${SCHEMA_VEREDITO}"` };
  if (typeof bruto.sha !== 'string' || !SHA.test(bruto.sha)) return { ok: false, erro: 'sha deve ter 40 caracteres hexadecimais minúsculos' };
  if (!texto(bruto.autor)) return { ok: false, erro: 'autor ausente' };
  if (!texto(bruto.revisor)) return { ok: false, erro: 'revisor ausente' };
  if (!Array.isArray(bruto.achados)) return { ok: false, erro: 'achados deve ser uma lista (vazia se não há achado)' };
  const achados: Achado[] = [];
  for (const [i, a] of bruto.achados.entries()) {
    const lido = lerAchado(a, i);
    if ('erro' in lido) return { ok: false, erro: lido.erro };
    achados.push(lido.achado);
  }
  const veredito: Veredito = { schema: SCHEMA_VEREDITO, sha: bruto.sha, autor: bruto.autor, revisor: bruto.revisor, achados };
  if (typeof bruto.resumo === 'string') veredito.resumo = bruto.resumo;
  return { ok: true, veredito };
}

/* ---------- Extração do JSON de um comentário ---------- */

const CERCA = /```(?:json)?[ \t]*(?:the-judge|the-judge-json)[^\n]*\n([\s\S]*?)```/gi;

/**
 * Tira o JSON do veredito de um texto: o texto inteiro se for JSON, ou o bloco ```json the-judge``` de um
 * comentário. Devolve `undefined` quando não há veredito; JSON quebrado devolve `null` (o check reprova).
 */
export function extrairVeredito(conteudo: string): unknown {
  const inteiro = conteudo.trim();
  const candidato = inteiro.startsWith('{') ? inteiro : [...conteudo.matchAll(CERCA)].at(-1)?.[1];
  if (candidato === undefined) return undefined;
  try {
    return JSON.parse(candidato);
  } catch {
    return null;
  }
}

/** Entre vários comentários vale o último que traz um veredito: push novo pede revisão nova. */
export function escolherVeredito(conteudos: readonly string[]): unknown {
  for (const c of [...conteudos].reverse()) {
    const v = extrairVeredito(c);
    if (v !== undefined) return v;
  }
  return undefined;
}

/* ---------- Avaliação ---------- */

export interface AlvoVeredito {
  /** SHA do head da PR. */
  sha: string;
  /** Identificador de quem escreveu a PR, na mesma forma usada no veredito. */
  autor: string;
  /**
   * Identidade exata que o revisor deve declarar (ADR-100: `actions/<run_id>/<tentativa>`). Quando passada, o
   * veredito só vale se foi montado pelo job que o conferiu: texto colado por uma sessão não leva essa identidade.
   */
  revisorEsperado?: string;
}

export interface Avaliacao {
  aprovado: boolean;
  /** Por que reprovou (vazio quando aprovou). */
  motivos: string[];
  bloqueantes: Achado[];
}

const igual = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function avaliarVeredito(bruto: unknown, alvo: AlvoVeredito): Avaliacao {
  if (bruto === undefined) return reprovar(['nenhum veredito do the-judge encontrado']);
  const lido = lerVeredito(bruto);
  if (!lido.ok) return reprovar([`veredito inválido: ${lido.erro}`]);
  const { veredito } = lido;
  const motivos: string[] = [];
  if (!igual(veredito.sha, alvo.sha)) motivos.push(`veredito é do commit ${veredito.sha.slice(0, 7)}, não do head ${alvo.sha.slice(0, 7)}`);
  if (igual(veredito.revisor, veredito.autor) || igual(veredito.revisor, alvo.autor)) {
    motivos.push('o autor não aprova a si mesmo: o revisor precisa ser outra identidade');
  }
  if (!igual(veredito.autor, alvo.autor)) motivos.push('o autor declarado no veredito não é o autor da PR');
  if (alvo.revisorEsperado !== undefined && veredito.revisor.trim() !== alvo.revisorEsperado.trim()) {
    motivos.push(`o revisor declarado (${veredito.revisor}) não é a identidade do job que julgou (${alvo.revisorEsperado})`);
  }
  const bloqueantes = veredito.achados.filter((a) => a.severidade === 'bloqueante');
  if (bloqueantes.length > 0) motivos.push(`${bloqueantes.length} achado(s) bloqueante(s)`);
  return { aprovado: motivos.length === 0, motivos, bloqueantes };
}

const reprovar = (motivos: string[]): Avaliacao => ({ aprovado: false, motivos, bloqueantes: [] });

export function formatarAvaliacao(a: Avaliacao): string {
  if (a.aprovado) return '✓ veredito do the-judge: aprovado (sem achado bloqueante)';
  const linhas = ['✗ veredito do the-judge reprovado:', ...a.motivos.map((m) => `  - ${m}`)];
  for (const b of a.bloqueantes) linhas.push(`  · bloqueante: ${b.titulo}${b.arquivo ? ` (${b.arquivo}${b.linha ? `:${b.linha}` : ''})` : ''}`);
  return linhas.join('\n');
}
