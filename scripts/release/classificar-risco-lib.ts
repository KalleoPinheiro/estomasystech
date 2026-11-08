/**
 * Regras puras do `npm run check:risco`: classe de risco da PR (0 a 3), calculada só pelo diff (ADR-097).
 *
 * Por quê: a aprovação humana fica reservada ao risco que não se desfaz por rollback (dado de saúde sob LGPD,
 * escopo de empresa, auth, cifra, migração não aditiva, os próprios portões). O resto segue sem pedir ok. A
 * classe NÃO vem de julgamento de LLM: vem de caminhos e da saída do `check:migracao`. Tudo aqui é
 * determinístico, sem git, sem disco e sem rede; a casca está em `classificar-risco.ts`.
 *
 * Falha fechada: relatório de migração ausente, de outro schema ou com erro vira classe 3.
 */
import { SCHEMA_SAIDA as SCHEMA_MIGRACAO } from './check-migracao-lib';

export const SCHEMA_RISCO = 'classificar-risco/v1';

export type Classe = 0 | 1 | 2 | 3;

export interface Motivo {
  classe: Classe;
  /** Identificador estável da regra (`caminho-sensivel`, `migracao-nao-aditiva`, `docs-ou-teste`...). */
  regra: string;
  arquivo?: string;
  detalhe: string;
}

export interface ResultadoRisco {
  schema: typeof SCHEMA_RISCO;
  classe: Classe;
  /** `true` só na classe 3: deploy espera a aprovação do dono (Environment `producao`). */
  aprovacaoHumana: boolean;
  /** Motivos da classe final (o que explica o número), em ordem de arquivo. */
  motivos: Motivo[];
}

/** O que o classificador lê do relatório `check-migracao/v1` (o resto do JSON não importa para a classe). */
export interface RelatorioMigracao {
  ok: boolean;
  classificacao: 'nenhuma' | 'aditiva' | 'nao_aditiva';
}

export interface EntradaRisco {
  /** Caminhos tocados no diff (`git diff --name-only --no-renames base...HEAD`). */
  arquivos: readonly string[];
  /** Saída do `check:migracao --json`; `null` quando não rodou ou não foi legível. */
  migracao: RelatorioMigracao | null;
  /** Nomes de pacotes de `package.json` cuja versão ou presença mudou no diff. */
  pacotesAlterados: readonly string[];
}

/* ---------- 1. Caminhos sensíveis (classe 3) ---------- */

interface RegraCaminho {
  regra: string;
  padrao: RegExp;
  detalhe: string;
}

/**
 * Fonte única dos caminhos que exigem aprovação humana. O primeiro que casar nomeia o motivo (o mais específico
 * vem antes: `tenant-scope.ts` em `src/lib/auth/` é escopo de empresa, não só auth). Mudar esta lista muda o portão, por isso `scripts/release/` está sob CODEOWNERS.
 */
export const CAMINHOS_SENSIVEIS: readonly RegraCaminho[] = [
  {
    regra: 'escopo-de-empresa',
    padrao: /(^|\/)tenant-scope[^/]*\.ts$|^src\/lib\/auth\/[^/]*-scope\.ts$/,
    detalhe: 'escopo de empresa (multi-tenancy, ADR-001)',
  },
  {
    regra: 'escopo-de-empresa',
    padrao: /^tests\/lib\/tenant-scope\.test\.ts$/,
    detalhe: 'allowlist do `systemScope()`',
  },
  {
    regra: 'cifra',
    padrao: /(^|\/)(data-cipher|crypto|blind-index|reencrypt-clinical-data)[^/]*\.ts$/,
    detalhe: 'cifra de dado de saúde ou índice cego',
  },
  {
    regra: 'auditoria',
    padrao: /^src\/(domain|application)\/audit\/|^src\/infrastructure\/.*audit[^/]*\.ts$/,
    detalhe: 'trilha de auditoria',
  },
  { regra: 'auth', padrao: /^src\/(domain\/auth|lib\/auth)\//, detalhe: 'autenticação, sessão ou papéis' },
  { regra: 'auth', padrao: /^src\/proxy\.ts$/, detalhe: 'camada 1 de autorização' },
  { regra: 'imagem-e-deploy', padrao: /^(Dockerfile|deploy\/)/, detalhe: 'imagem e arquivos de deploy' },
  { regra: 'workflow', padrao: /^\.github\/(workflows\/|CODEOWNERS$)/, detalhe: 'workflow do Actions ou CODEOWNERS' },
  {
    regra: 'portao',
    padrao: /^(scripts\/(gate|gate-cloud|release)(\/|\.sh$)|\.husky\/|\.claude\/hooks\/|\.claude\/settings\.json$)/,
    detalhe: 'script ou hook que é o próprio portão',
  },
  {
    regra: 'portao',
    padrao: /^(vitest(\.[a-z]+)?\.config\.mts|stryker\.config\.json|playwright\.config\.ts|biome\.json)$/,
    detalhe: 'configuração de teste, cobertura, mutação ou lint (limiares)',
  },
];

/** Pacotes de runtime que tocam auth, cifra, banco, rede ou armazenamento de dado de saúde. */
export const PACOTES_SENSIVEIS: readonly string[] = [
  'next',
  'drizzle-orm',
  'drizzle-kit',
  'pg',
  '@aws-sdk/client-s3',
  'googleapis',
  'sharp',
];
const PADRAO_PACOTE_SENSIVEL = /(argon|bcrypt|jose|jsonwebtoken|crypto|oauth|passport|auth|helmet)/i;

export const pacoteSensivel = (nome: string): boolean =>
  PACOTES_SENSIVEIS.includes(nome) || PADRAO_PACOTE_SENSIVEL.test(nome);

export interface ManifestoPacotes {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** Nomes cuja versão mudou, entrou ou saiu entre dois `package.json` (campo `version` do app não conta). */
export function pacotesAlterados(antes: ManifestoPacotes | null, depois: ManifestoPacotes): string[] {
  const secoes = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;
  const alterados = new Set<string>();
  for (const secao of secoes) {
    const a = antes?.[secao] ?? {};
    const d = depois[secao] ?? {};
    for (const nome of new Set([...Object.keys(a), ...Object.keys(d)])) {
      if (a[nome] !== d[nome]) alterados.add(nome);
    }
  }
  return [...alterados].sort();
}

export interface ManifestoLock {
  packages?: Record<string, { version?: string; dev?: boolean } | undefined>;
}

/**
 * Pacotes de **runtime** (fora `dev: true`) cuja versão mudou, entrou ou saiu no `package-lock.json`.
 * Pega a dependência transitiva sensível que o `package.json` não mostra.
 */
export function pacotesAlteradosLock(antes: ManifestoLock | null, depois: ManifestoLock): string[] {
  const a = antes?.packages ?? {};
  const d = depois.packages ?? {};
  const alterados = new Set<string>();
  for (const chave of new Set([...Object.keys(a), ...Object.keys(d)])) {
    const nome = chave.replace(/^.*node_modules\//, '');
    const emDev = (d[chave] ?? a[chave])?.dev === true;
    if (nome !== '' && !emDev && a[chave]?.version !== d[chave]?.version) alterados.add(nome);
  }
  return [...alterados].sort();
}

/* ---------- 2. Documentação e teste (classe 0) ---------- */

/** `.md` que é documentação (não código, pipeline nem configuração de agente), como em `isDocsOnly` (ADR-053). */
const MD_FORA_DE_CODIGO = /^(?!(src|tests|e2e|drizzle|scripts|deploy|\.github|\.claude|\.gate|\.husky|node_modules)\/).*\.md$/;
const TESTE = /^(tests|e2e)\//;

export function somenteDocsOuTeste(arquivo: string): boolean {
  return TESTE.test(arquivo) || MD_FORA_DE_CODIGO.test(arquivo);
}

/* ---------- 3. Migração (classe 2 ou 3) ---------- */

const MIGRACAO = /^drizzle\//;

/** Lê o JSON do `check:migracao` sem confiar nele: schema errado ou forma inesperada vira `null`. */
export function lerRelatorioMigracao(bruto: unknown): RelatorioMigracao | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const r = bruto as Record<string, unknown>;
  const classes = ['nenhuma', 'aditiva', 'nao_aditiva'];
  if (r.schema !== SCHEMA_MIGRACAO || typeof r.ok !== 'boolean') return null;
  if (typeof r.classificacao !== 'string' || !classes.includes(r.classificacao)) return null;
  return { ok: r.ok, classificacao: r.classificacao as RelatorioMigracao['classificacao'] };
}

function motivoMigracao(arquivo: string, migracao: RelatorioMigracao | null): Motivo {
  if (migracao === null) {
    return { classe: 3, regra: 'migracao-sem-relatorio', arquivo, detalhe: 'relatório do check:migracao ausente ou ilegível (falha fechada)' };
  }
  if (!migracao.ok) {
    return { classe: 3, regra: 'migracao-com-erro', arquivo, detalhe: 'check:migracao reportou erro estrutural no journal ou numa migração existente' };
  }
  if (migracao.classificacao === 'nao_aditiva') {
    return { classe: 3, regra: 'migracao-nao-aditiva', arquivo, detalhe: 'migração não aditiva: o código anterior não roda sobre o esquema novo' };
  }
  if (migracao.classificacao === 'aditiva') {
    return { classe: 2, regra: 'migracao-aditiva', arquivo, detalhe: 'migração aditiva (passa no lint)' };
  }
  return { classe: 1, regra: 'codigo', arquivo, detalhe: 'tocou `drizzle/` sem migração nova' };
}

/* ---------- 4. Classificação ---------- */

function motivoDoArquivo(arquivo: string, migracao: RelatorioMigracao | null): Motivo {
  const sensivel = CAMINHOS_SENSIVEIS.find((r) => r.padrao.test(arquivo));
  if (sensivel) return { classe: 3, regra: sensivel.regra, arquivo, detalhe: sensivel.detalhe };
  if (arquivo === 'package-lock.json') {
    return { classe: 2, regra: 'lockfile', arquivo, detalhe: 'lockfile alterado (classe 3 se tocar dependência sensível de runtime)' };
  }
  if (somenteDocsOuTeste(arquivo)) return { classe: 0, regra: 'docs-ou-teste', arquivo, detalhe: 'documentação ou teste' };
  if (MIGRACAO.test(arquivo)) return motivoMigracao(arquivo, migracao);
  return { classe: 1, regra: 'codigo', arquivo, detalhe: 'código sem migração nem caminho sensível' };
}

export function classificarRisco(entrada: EntradaRisco): ResultadoRisco {
  const motivos: Motivo[] = entrada.arquivos.map((a) => motivoDoArquivo(a, entrada.migracao));
  for (const pacote of entrada.pacotesAlterados) {
    if (pacoteSensivel(pacote)) {
      motivos.push({ classe: 3, regra: 'dependencia-sensivel', arquivo: 'package.json', detalhe: `dependência sensível alterada: ${pacote}` });
    }
  }
  const classe = motivos.reduce<Classe>((max, m) => (m.classe > max ? m.classe : max), 0);
  const explicam = motivos.filter((m) => m.classe === classe);
  return {
    schema: SCHEMA_RISCO,
    classe,
    aprovacaoHumana: classe === 3,
    motivos: explicam.length > 0 ? explicam : [{ classe: 0, regra: 'diff-vazio', detalhe: 'nenhum arquivo no diff' }],
  };
}

export function formatarRisco(r: ResultadoRisco): string {
  const linhas = [`Classe de risco: ${r.classe}${r.aprovacaoHumana ? ' (exige aprovação humana)' : ''}`];
  for (const m of r.motivos) linhas.push(`  - [${m.regra}] ${m.arquivo ?? '(diff)'}: ${m.detalhe}`);
  return linhas.join('\n');
}

/** Linhas `chave=valor` no formato de `$GITHUB_OUTPUT`. */
export const saidaGithub = (r: ResultadoRisco): string => `classe=${r.classe}\naprovacao_humana=${r.aprovacaoHumana}`;
