/**
 * Regras puras da migração de produção feita pelo Release deploy (ADR-113): lê o estado do banco, decide o
 * que falta e monta o SQL com os MESMOS valores que o migrador do Drizzle grava (`hash` = sha256 do arquivo
 * inteiro, `created_at` = `when` do journal). Nada aqui toca disco, rede ou banco; a casca é `migrar-producao.ts`.
 *
 * Por quê: em 2026-11-17 o deploy subiu código novo sobre banco velho porque nenhum passo migrava com o dono
 * (postmortem da v0.9.1). Hash calculado à mão faria o `db:migrate` seguinte divergir; por isso o hash vem do
 * `readMigrationFiles` do próprio drizzle-orm.
 */
import { classificarMigracao } from './check-migracao-lib';

export interface MigracaoDoJournal {
  tag: string;
  /** `when` do journal: o Drizzle grava o mesmo valor em `created_at`. */
  when: number;
  /** sha256 do arquivo .sql inteiro, igual ao do Drizzle. */
  hash: string;
  /** Instruções, já divididas em `--> statement-breakpoint`. */
  instrucoes: string[];
}

export interface EstadoBanco {
  /** A tabela `drizzle.__drizzle_migrations` não existe (banco nunca migrado). */
  tabelaAusente: boolean;
  /** `created_at` de cada migração registrada na tabela do Drizzle. */
  aplicadas: number[];
  /** A função `public.app__drizzle_migrations()` (0080) não existe. */
  funcaoAusente: boolean;
  /** `created_at` devolvidos pela função: é o que o readiness da aplicação enxerga. */
  daFuncao: number[];
}

export interface Plano {
  pendentes: MigracaoDoJournal[];
  /** Migrações do journal mais antigas que a última aplicada e ausentes: o Drizzle as pularia para sempre. */
  buracos: MigracaoDoJournal[];
}

const LINHA_DE_CARIMBO = /^([DF]) (\d+)$/;

/** Interpreta a saída do `ci-migrate.sh estado`; sem a linha final `ESTADO_OK` a leitura é inválida. */
export function parseEstado(texto: string): EstadoBanco {
  const linhas = texto
    .split('\n')
    .map((l) => l.replace(/\r$/, '').trim())
    .filter(Boolean);
  if (linhas.at(-1) !== 'ESTADO_OK') {
    throw new Error('estado do banco incompleto: falta ESTADO_OK');
  }
  const estado: EstadoBanco = {
    tabelaAusente: false,
    aplicadas: [],
    funcaoAusente: false,
    daFuncao: [],
  };
  for (const linha of linhas.slice(0, -1)) {
    if (linha === 'TABELA_AUSENTE') estado.tabelaAusente = true;
    else if (linha === 'FUNCAO_AUSENTE') estado.funcaoAusente = true;
    else {
      const achou = LINHA_DE_CARIMBO.exec(linha);
      if (!achou) throw new Error(`linha inesperada no estado do banco: ${linha.slice(0, 40)}`);
      (achou[1] === 'D' ? estado.aplicadas : estado.daFuncao).push(Number(achou[2]));
    }
  }
  return estado;
}

/** Mesma regra do migrador do Drizzle: aplica o que tem `when` maior que o último carimbo registrado. */
export function planejar(journal: readonly MigracaoDoJournal[], estado: EstadoBanco): Plano {
  const aplicadas = new Set(estado.aplicadas);
  const ultima = estado.aplicadas.length === 0 ? null : Math.max(...estado.aplicadas);
  const pendentes = journal.filter((m) => ultima === null || m.when > ultima);
  const buracos = journal.filter((m) => ultima !== null && m.when <= ultima && !aplicadas.has(m.when));
  return { pendentes, buracos };
}

function comPontoEVirgula(instrucao: string): string {
  const texto = instrucao.trim();
  return texto.endsWith(';') ? texto : `${texto};`;
}

/**
 * SQL do plano, sem BEGIN nem COMMIT: quem executa (`ci-migrate.sh`) abre a transação, e isso permite
 * simular (ROLLBACK) e aplicar pelo mesmo caminho. Uma transação só, como no Drizzle.
 */
export function montarSql(pendentes: readonly MigracaoDoJournal[]): string {
  const partes = [
    'CREATE SCHEMA IF NOT EXISTS "drizzle";',
    'CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);',
  ];
  for (const m of pendentes) {
    partes.push(`-- ${m.tag} (${m.when})`);
    for (const instrucao of m.instrucoes) {
      if (instrucao.trim()) partes.push(comPontoEVirgula(instrucao));
    }
    partes.push(
      `insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values('${m.hash}', ${m.when});`,
    );
  }
  return `${partes.join('\n')}\n`;
}

/** Tags das migrações pendentes que o lint de migração aditiva classifica como não aditivas (falha fechada). */
export function naoAditivas(
  pendentes: readonly MigracaoDoJournal[],
  lerSql: (tag: string) => string,
): string[] {
  return pendentes
    .filter((m) => classificarMigracao(`${m.tag}.sql`, lerSql(m.tag)).classificacao === 'nao_aditiva')
    .map((m) => m.tag);
}

/**
 * O que ainda falta DEPOIS de migrar: tudo o que o journal tem precisa estar na tabela do Drizzle e na função
 * que o readiness da aplicação lê. Vazio = o banco não deixa nada pendente.
 */
export function faltandoDepoisDeMigrar(journal: readonly MigracaoDoJournal[], estado: EstadoBanco): string[] {
  const problemas: string[] = [];
  if (estado.tabelaAusente) problemas.push('tabela drizzle.__drizzle_migrations ausente');
  if (estado.funcaoAusente) problemas.push('função public.app__drizzle_migrations() ausente');
  const tabela = new Set(estado.aplicadas);
  const funcao = new Set(estado.daFuncao);
  for (const m of journal) {
    if (!estado.tabelaAusente && !tabela.has(m.when)) problemas.push(`${m.tag} fora da tabela do Drizzle`);
    if (!estado.funcaoAusente && !funcao.has(m.when)) problemas.push(`${m.tag} fora da função do readiness`);
  }
  return problemas;
}
