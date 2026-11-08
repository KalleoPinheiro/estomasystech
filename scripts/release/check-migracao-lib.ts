/**
 * Regras puras do `npm run check:migracao`: lint de migração aditiva ("expandir, migrar, contrair").
 *
 * Por quê: o app migra no boot e o container antigo ainda atende até o novo ficar `healthy`, então por alguns
 * segundos o código antigo roda sobre o esquema novo. Sem `down` (ADR-039), só migração compatível com o
 * código anterior permite deploy e rollback sem humano. Este módulo classifica o SQL e confere o journal do
 * Drizzle. Tudo aqui é determinístico, sem git, sem disco e sem rede; a casca está em `check-migracao.ts`.
 *
 * Falha fechada: o que o lint não reconhece conta como **não aditivo**.
 */

export const SCHEMA_SAIDA = 'check-migracao/v1';

export type ClassificacaoInstrucao = 'aditiva' | 'nao_aditiva';
export type ClassificacaoGeral = 'nenhuma' | 'aditiva' | 'nao_aditiva';

export interface Instrucao {
  classificacao: ClassificacaoInstrucao;
  /** Identificador estável da regra que decidiu (`add-column`, `drop`, `set-not-null`, `desconhecida`...). */
  regra: string;
  motivo: string;
  /** SQL normalizado, cortado em `MAX_SQL`. */
  sql: string;
}

export interface MigracaoAnalisada {
  arquivo: string;
  tag: string;
  classificacao: ClassificacaoInstrucao;
  instrucoes: Instrucao[];
}

export interface ErroLint {
  codigo: string;
  mensagem: string;
  arquivo?: string;
}

export interface EntradaJournal {
  idx: number;
  version?: string;
  when: number;
  tag: string;
  breakpoints?: boolean;
}

export interface Relatorio {
  schema: typeof SCHEMA_SAIDA;
  base: string | null;
  /** `false` quando há `erros` (journal fora de ordem, migração antiga alterada...). */
  ok: boolean;
  classificacao: ClassificacaoGeral;
  migracoes: MigracaoAnalisada[];
  erros: ErroLint[];
}

const MAX_SQL = 200;
const BREAKPOINT = '--> statement-breakpoint';

/* ---------- 1. Leitura do SQL ---------- */

/**
 * Parte o arquivo em instruções: respeita aspas simples (texto) e duplas (identificador), tira comentários de
 * linha e de bloco e separa por `;`. O marcador `--> statement-breakpoint` do Drizzle é só um comentário de linha.
 */
export function dividirInstrucoes(sql: string): string[] {
  const saida: string[] = [];
  let atual = '';
  let i = 0;
  const copiarAte = (fim: string): void => {
    // Copia a partir de `i` (que está na aspa de abertura) até a aspa de fechamento, tratando `''` e `""`.
    atual += sql[i++];
    while (i < sql.length) {
      atual += sql[i];
      if (sql[i] === fim && sql[i + 1] === fim) {
        atual += sql[++i];
      } else if (sql[i] === fim) {
        i++;
        return;
      }
      i++;
    }
  };
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      copiarAte(c);
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
    } else if (c === '/' && sql[i + 1] === '*') {
      const fim = sql.indexOf('*/', i + 2);
      i = fim < 0 ? sql.length : fim + 2;
      atual += ' ';
    } else if (c === ';') {
      saida.push(atual);
      atual = '';
      i++;
    } else {
      atual += c;
      i++;
    }
  }
  saida.push(atual);
  return saida.map((s) => s.trim()).filter(Boolean);
}

/**
 * Forma comparável: minúsculas, espaços colapsados, textos entre aspas simples esvaziados (`''`), aspas de
 * identificador e prefixo `public.` removidos. `"clinics"."dpo_name"` vira `clinics.dpo_name`.
 */
export function normalizar(instrucao: string): string {
  return instrucao
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"/g, '')
    .replace(/\bpublic\./gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Parte `texto` por vírgulas fora de parênteses (as ações de um `ALTER TABLE`). */
export function dividirPorVirgula(texto: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let atual = '';
  for (const c of texto) {
    if (c === '(') nivel++;
    if (c === ')') nivel--;
    if (c === ',' && nivel === 0) {
      partes.push(atual.trim());
      atual = '';
    } else {
      atual += c;
    }
  }
  partes.push(atual.trim());
  return partes.filter(Boolean);
}

/* ---------- 2. Novidades da própria migração ---------- */

interface Contexto {
  /** Tabelas criadas nesta migração: nada no código antigo as conhece. */
  tabelasNovas: Set<string>;
  /** `tabela.coluna` adicionadas nesta migração: idem. */
  colunasNovas: Set<string>;
}

const CREATE_TABLE = /^create (?:unlogged |temp(?:orary)? )?table (?:if not exists )?([\w.]+)/;
const ALTER_TABLE = /^alter table (?:if exists )?(?:only )?([\w.]+) (.+)$/;
const ADD_COLUMN = /^add (?:column )?(?:if not exists )?([\w]+) /;
/** `ADD CONSTRAINT x ...` e as formas sem nome: `ADD UNIQUE (...)`, `ADD FOREIGN KEY ...`, `ADD CHECK (...)`... */
const ADD_CONSTRAINT = /^add (?:constraint\b|unique\b|primary key\b|foreign key\b|check\b|exclude\b)/;

/** Primeira passada: o que esta migração cria, para as regras da segunda reconhecerem alvos novos. */
export function coletarNovidades(normalizadas: readonly string[]): Contexto {
  const ctx: Contexto = { tabelasNovas: new Set(), colunasNovas: new Set() };
  for (const s of normalizadas) {
    const tabela = CREATE_TABLE.exec(s)?.[1];
    if (tabela) ctx.tabelasNovas.add(tabela);
    const alter = ALTER_TABLE.exec(s);
    if (!alter) continue;
    for (const acao of dividirPorVirgula(alter[2])) {
      const coluna = ADD_COLUMN.exec(acao)?.[1];
      if (coluna && !ADD_CONSTRAINT.test(acao)) ctx.colunasNovas.add(`${alter[1]}.${coluna}`);
    }
  }
  return ctx;
}

/* ---------- 3. Regras por instrução ---------- */

type Veredito = Pick<Instrucao, 'classificacao' | 'regra' | 'motivo'>;

const aditiva = (regra: string, motivo: string): Veredito => ({ classificacao: 'aditiva', regra, motivo });
const naoAditiva = (regra: string, motivo: string): Veredito => ({ classificacao: 'nao_aditiva', regra, motivo });
const DESCONHECIDA = naoAditiva('desconhecida', 'instrução que o lint não reconhece conta como não aditiva (falha fechada)');

/** Colunas do primeiro grupo de parênteses (`(a, b)`), sem ordem/opclass; `[]` se não houver. */
function colunasDoGrupo(texto: string): string[] {
  const m = /\(([^()]*)\)/.exec(texto);
  return m ? m[1].split(',').map((c) => c.trim().split(' ')[0]) : [];
}

const todasNovas = (ctx: Contexto, tabela: string, colunas: readonly string[]): boolean =>
  colunas.length > 0 && colunas.every((c) => ctx.colunasNovas.has(`${tabela}.${c.replace(`${tabela}.`, '')}`));

/** Colunas `tabela.coluna` citadas numa expressão `CHECK (...)`. */
const colunasCitadas = (expressao: string, tabela: string): string[] =>
  [...expressao.matchAll(new RegExp(`\\b${tabela.replace('.', '\\.')}\\.(\\w+)`, 'g'))].map((m) => m[1]);

function constraintEmColunasNovas(acao: string, tabela: string, ctx: Contexto): boolean {
  if (/ (foreign key|unique|primary key) \(/.test(acao)) {
    const depois = acao.slice(acao.search(/ (foreign key|unique|primary key) \(/));
    return todasNovas(ctx, tabela, colunasDoGrupo(depois));
  }
  if (/ check \(/.test(acao)) return todasNovas(ctx, tabela, colunasCitadas(acao, tabela));
  return false;
}

function acaoAddConstraint(acao: string, tabela: string, ctx: Contexto): Veredito {
  if (/ not valid$/.test(acao)) return aditiva('add-constraint-not-valid', 'constraint NOT VALID não varre a tabela existente');
  if (ctx.tabelasNovas.has(tabela)) return aditiva('constraint-em-tabela-nova', 'tabela criada nesta migração');
  if (constraintEmColunasNovas(acao, tabela, ctx)) {
    return aditiva('constraint-em-colunas-novas', 'só colunas criadas nesta migração: nenhuma linha antiga a validar');
  }
  return naoAditiva('add-constraint-sem-not-valid', 'ADD CONSTRAINT valida a tabela existente e o código antigo pode violá-la; use NOT VALID');
}

function acaoAddColumn(acao: string, tabela: string, ctx: Contexto): Veredito {
  if (ctx.tabelasNovas.has(tabela)) return aditiva('add-column', 'tabela criada nesta migração');
  const semValor = /\bnot null\b|\bprimary key\b/.test(acao) && !/\bdefault\b|\bgenerated\b|\bserial\b/.test(acao);
  return semValor
    ? naoAditiva('add-column-not-null-sem-default', 'o código antigo insere sem a coluna e falha; use coluna nula ou DEFAULT')
    : aditiva('add-column', 'coluna nula ou com DEFAULT');
}

const ACOES_ALTER_COLUMN: ReadonlyArray<readonly [RegExp, Veredito]> = [
  [/ set not null$/, naoAditiva('set-not-null', 'NOT NULL em coluna existente quebra o código antigo que grava nulo')],
  [/ drop not null$/, aditiva('drop-not-null', 'relaxar NOT NULL não quebra o código antigo')],
  [/ set default /, aditiva('set-default', 'DEFAULT novo não quebra o código antigo')],
  [/ drop default$/, naoAditiva('drop-default', 'sem o DEFAULT o código antigo que omite a coluna falha')],
  [/ (set data )?type /, naoAditiva('alter-column-type', 'mudar o tipo da coluna quebra o código antigo')],
];

function acaoAlterColumn(acao: string): Veredito {
  return ACOES_ALTER_COLUMN.find(([re]) => re.test(acao))?.[1] ?? DESCONHECIDA;
}

function classificarAcao(acao: string, tabela: string, ctx: Contexto): Veredito {
  if (/^rename\b/.test(acao)) return naoAditiva('rename', 'renomear quebra o código antigo');
  if (/^drop\b/.test(acao)) return naoAditiva('drop', 'remover quebra o código antigo');
  if (ADD_CONSTRAINT.test(acao)) return acaoAddConstraint(acao, tabela, ctx);
  if (/^add (?:column )?(?:if not exists )?\w+ /.test(acao)) return acaoAddColumn(acao, tabela, ctx);
  if (/^alter (?:column )?\w+ /.test(acao)) return acaoAlterColumn(acao);
  if (/^validate constraint\b/.test(acao)) return aditiva('validate-constraint', 'valida o que já era NOT VALID');
  return DESCONHECIDA;
}

/** O pior veredito vence: uma ação não aditiva torna o `ALTER TABLE` inteiro não aditivo. */
function classificarAlterTable(s: string, ctx: Contexto): Veredito {
  const alter = ALTER_TABLE.exec(s);
  if (!alter) return DESCONHECIDA;
  const vereditos = dividirPorVirgula(alter[2]).map((a) => classificarAcao(a, alter[1], ctx));
  return vereditos.find((v) => v.classificacao === 'nao_aditiva') ?? vereditos[0];
}

function classificarCreateIndex(s: string, ctx: Contexto): Veredito {
  const m = /^create (unique )?index (?:concurrently )?(?:if not exists )?\w+ on (?:only )?([\w.]+)/.exec(s);
  if (!m) return DESCONHECIDA;
  const [, unico, tabela] = m;
  if (ctx.tabelasNovas.has(tabela)) return aditiva('create-index', 'tabela criada nesta migração');
  if (!unico) return aditiva('create-index', 'índice comum só acelera; o código antigo não depende dele');
  const colunas = colunasDoGrupo(s.slice(s.indexOf(' on ')));
  return todasNovas(ctx, tabela, colunas)
    ? aditiva('create-unique-index', 'só colunas criadas nesta migração')
    : naoAditiva('create-unique-index-em-tabela-existente', 'índice único em dado existente pode falhar e o código antigo pode violá-lo');
}

const REGRAS_INICIO: ReadonlyArray<readonly [RegExp, Veredito]> = [
  [/^drop\b/, naoAditiva('drop', 'remover quebra o código antigo')],
  [/^truncate\b/, naoAditiva('truncate', 'apaga dados em massa')],
  [/^update\b/, naoAditiva('update-em-massa', 'UPDATE reescreve dado que o código antigo lê')],
  [/^delete\b/, naoAditiva('delete-em-massa', 'DELETE apaga dado que o código antigo lê')],
  [/^alter type\b/, naoAditiva('alter-type', 'ALTER TYPE muda o contrato que o código antigo conhece')],
  [/^create (?:unlogged |temp(?:orary)? )?table\b/, aditiva('create-table', 'tabela nova: o código antigo a ignora')],
  [/^create (?:type|sequence|schema|extension)\b/, aditiva('create-objeto-novo', 'objeto novo: o código antigo o ignora')],
  [/^insert into\b/, aditiva('insert', 'linhas novas não mudam o contrato')],
  [/^comment on\b/, aditiva('comment', 'só metadado')],
];

/** Classifica uma instrução já normalizada. */
export function classificarInstrucao(s: string, ctx: Contexto): Veredito {
  const direta = REGRAS_INICIO.find(([re]) => re.test(s))?.[1];
  if (direta) return direta;
  if (s.startsWith('alter table ')) return classificarAlterTable(s, ctx);
  if (/^create (?:unique )?index\b/.test(s)) return classificarCreateIndex(s, ctx);
  return DESCONHECIDA;
}

/* ---------- 4. Migração inteira ---------- */

const resumir = (s: string): string => (s.length > MAX_SQL ? `${s.slice(0, MAX_SQL)}…` : s);

/** Classifica todas as instruções de um arquivo; uma não aditiva (ou desconhecida) basta. */
export function classificarMigracao(arquivo: string, sql: string): MigracaoAnalisada {
  const normalizadas = dividirInstrucoes(sql).map(normalizar);
  const ctx = coletarNovidades(normalizadas);
  const instrucoes = normalizadas.map((s) => ({ ...classificarInstrucao(s, ctx), sql: resumir(s) }));
  const naoAditivo = instrucoes.some((i) => i.classificacao === 'nao_aditiva');
  return {
    arquivo,
    tag: arquivo.replace(/^.*\//, '').replace(/\.sql$/, ''),
    classificacao: naoAditivo ? 'nao_aditiva' : 'aditiva',
    instrucoes,
  };
}

/* ---------- 5. Journal ---------- */

const erro = (codigo: string, mensagem: string, arquivo?: string): ErroLint =>
  arquivo ? { codigo, mensagem, arquivo } : { codigo, mensagem };

function erroDeEntrada(e: EntradaJournal, i: number, anterior: EntradaJournal | undefined): ErroLint[] {
  const erros: ErroLint[] = [];
  if (e.idx !== i) erros.push(erro('journal-idx', `entrada ${e.tag}: idx ${e.idx} na posição ${i}`));
  const prefixo = /^(\d{4})_/.exec(e.tag)?.[1];
  if (prefixo === undefined || Number(prefixo) !== e.idx) {
    erros.push(erro('journal-tag-prefixo', `tag ${e.tag} não começa com o idx ${String(e.idx).padStart(4, '0')}`));
  }
  if (anterior && e.when <= anterior.when) {
    erros.push(
      erro(
        'journal-when-fora-de-ordem',
        `${e.tag}: when ${e.when} não é maior que o de ${anterior.tag} (${anterior.when}); o migrador do Drizzle pularia a migração para sempre (producao.md § 4)`,
      ),
    );
  }
  return erros;
}

/** Journal coerente: idx contínuo, prefixo da tag, `when` estritamente crescente, tags únicas e arquivo por tag. */
export function validarJournal(entradas: readonly EntradaJournal[], arquivosSql: readonly string[]): ErroLint[] {
  const erros = entradas.flatMap((e, i) => erroDeEntrada(e, i, entradas[i - 1]));
  const vistas = new Set<string>();
  for (const e of entradas) {
    if (vistas.has(e.tag)) erros.push(erro('journal-tag-duplicada', `tag ${e.tag} repetida no journal`));
    vistas.add(e.tag);
  }
  const arquivos = new Set(arquivosSql.map((a) => a.replace(/\.sql$/, '')));
  for (const e of entradas) {
    if (!arquivos.has(e.tag)) erros.push(erro('journal-sem-arquivo', `o journal lista ${e.tag}, mas não há ${e.tag}.sql`));
  }
  for (const a of [...arquivos].sort()) {
    if (!vistas.has(a)) erros.push(erro('arquivo-sem-journal', `${a}.sql não está no journal e nunca seria aplicada`, `drizzle/${a}.sql`));
  }
  return erros;
}

/** O journal só cresce no fim: entradas da base não mudam nem de lugar nem de conteúdo. */
export function validarSoAcrescenta(base: readonly EntradaJournal[], atual: readonly EntradaJournal[]): ErroLint[] {
  const alterada = base.find((b, i) => atual[i]?.tag !== b.tag || atual[i]?.when !== b.when);
  return alterada
    ? [erro('journal-nao-so-acrescenta', `a entrada ${alterada.tag} do journal mudou ou sumiu; só é permitido acrescentar ao fim`)]
    : [];
}

/* ---------- 6. Orquestração ---------- */

export interface EntradaVerificacao {
  base: string | null;
  journal: readonly EntradaJournal[];
  /** Journal da base; `null` quando a base não o tem. */
  journalBase: readonly EntradaJournal[] | null;
  /** Nomes dos `drizzle/*.sql` presentes (sem diretório). */
  arquivosSql: readonly string[];
  /** Caminhos `drizzle/*.sql` a classificar (os adicionados no diff, ou todos com `--all`). */
  analisar: readonly string[];
  /** Caminhos `drizzle/*.sql` já existentes na base que o diff alterou, removeu ou renomeou. */
  alterados: readonly string[];
  lerSql: (caminho: string) => string;
}

function classificacaoGeral(migracoes: readonly MigracaoAnalisada[]): ClassificacaoGeral {
  if (migracoes.length === 0) return 'nenhuma';
  return migracoes.some((m) => m.classificacao === 'nao_aditiva') ? 'nao_aditiva' : 'aditiva';
}

/** Monta o relatório completo: erros estruturais do journal e das migrações antigas, e a classificação das novas. */
export function verificar(entrada: EntradaVerificacao): Relatorio {
  const erros = [
    ...validarJournal(entrada.journal, entrada.arquivosSql),
    ...(entrada.journalBase ? validarSoAcrescenta(entrada.journalBase, entrada.journal) : []),
    ...entrada.alterados.map((a) =>
      erro('migracao-existente-alterada', `${a} já existe na base e não pode mudar: corrija com uma migração nova`, a),
    ),
  ];
  const migracoes = [...entrada.analisar].sort().map((c) => classificarMigracao(c, entrada.lerSql(c)));
  return {
    schema: SCHEMA_SAIDA,
    base: entrada.base,
    ok: erros.length === 0,
    classificacao: classificacaoGeral(migracoes),
    migracoes,
    erros,
  };
}

/** Texto para quem lê no terminal; o JSON é a saída para máquina. */
export function formatarRelatorio(r: Relatorio): string {
  const linhas = [`check:migracao (base ${r.base ?? 'n/d'}): ${r.classificacao}`];
  for (const m of r.migracoes) {
    linhas.push(`  ${m.classificacao === 'aditiva' ? '✓' : '✗'} ${m.arquivo}: ${m.classificacao}`);
    for (const i of m.instrucoes.filter((x) => x.classificacao === 'nao_aditiva')) {
      linhas.push(`      - [${i.regra}] ${i.motivo}: ${i.sql}`);
    }
  }
  for (const e of r.erros) linhas.push(`  ✗ [${e.codigo}] ${e.mensagem}`);
  return linhas.join('\n');
}

/** Código de saída: 1 com erro estrutural, ou com migração não aditiva quando `exigirAditiva`. */
export function codigoDeSaida(r: Relatorio, exigirAditiva: boolean): 0 | 1 {
  return !r.ok || (exigirAditiva && r.classificacao === 'nao_aditiva') ? 1 : 0;
}
