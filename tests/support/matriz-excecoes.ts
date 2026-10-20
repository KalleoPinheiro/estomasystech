/**
 * Matriz de casos de exceção por domínio (ADR-049, issue #408).
 * Cada `docs/domains/<d>/excecoes.md` tem uma tabela
 * `| Categoria | Caso | Regra | Teste |`; a coluna Teste cita
 * `` `arquivo.test.ts` › "trecho literal do título" `` ou `n/a — motivo`.
 */
export const CATEGORIAS_DE_EXCECAO = [
  'entrada inválida',
  'sem permissão',
  'outra clínica',
  'duplicidade',
  'concorrência',
  'falha de integração',
  'estado terminal',
] as const;

export interface LinhaDaMatriz {
  categoria: string;
  caso: string;
  regra: string;
  teste: string;
  linha: number;
}

export interface TesteCitado {
  arquivo: string;
  titulo: string;
}

const CITACAO = /`([^`]+\.(?:test|spec)\.tsx?)`\s*›\s*"([^"]+)"/g;
const MOTIVO_NA = /^n\/a\s+[—-]\s+(\S.{9,})$/;

function celulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((celula) => celula.trim().replaceAll('\\|', '|'));
}

/** Linhas das tabelas cujo cabeçalho começa com `Categoria`. */
export function linhasDaMatriz(markdown: string): LinhaDaMatriz[] {
  const linhas: LinhaDaMatriz[] = [];
  let naTabela = false;
  for (const [indice, texto] of markdown.split('\n').entries()) {
    if (!texto.trim().startsWith('|')) {
      naTabela = false;
      continue;
    }
    const [primeira = '', caso = '', regra = '', teste = ''] = celulas(texto);
    if (primeira.toLowerCase() === 'categoria') {
      naTabela = true;
    } else if (naTabela && !/^-+$/.test(primeira.replaceAll(/[\s:]/g, ''))) {
      linhas.push({
        categoria: primeira,
        caso,
        regra,
        teste,
        linha: indice + 1,
      });
    }
  }
  return linhas;
}

export function testesCitados(celula: string): TesteCitado[] {
  return [...celula.matchAll(CITACAO)].map((achado) => ({
    arquivo: achado[1] ?? '',
    titulo: achado[2] ?? '',
  }));
}

/**
 * Problemas da matriz de um domínio. Lista vazia = toda categoria tem linha, e
 * toda linha cita teste que existe (arquivo + título literal) ou `n/a` com motivo.
 */
export function problemasDaMatriz(
  dominio: string,
  markdown: string,
  idsDocumentados: readonly string[],
  lerArquivo: (caminho: string) => string | null,
): string[] {
  const problemas: string[] = [];
  const linhas = linhasDaMatriz(markdown);
  for (const categoria of CATEGORIAS_DE_EXCECAO) {
    if (!linhas.some((l) => l.categoria === categoria)) {
      problemas.push(`${dominio}: categoria "${categoria}" sem linha`);
    }
  }
  for (const l of linhas) {
    const onde = `${dominio}:${l.linha}`;
    if (!(CATEGORIAS_DE_EXCECAO as readonly string[]).includes(l.categoria)) {
      problemas.push(`${onde}: categoria desconhecida "${l.categoria}"`);
    }
    if (l.caso === '') {
      problemas.push(`${onde}: caso vazio`);
    }
    problemas.push(...problemasDeRegra(onde, l.regra, idsDocumentados));
    problemas.push(...problemasDeTeste(onde, l.teste, lerArquivo));
  }
  return problemas;
}

function problemasDeRegra(
  onde: string,
  regra: string,
  idsDocumentados: readonly string[],
): string[] {
  if (regra === '—' || regra === '') {
    return [];
  }
  return regra
    .split(',')
    .map((id) => id.trim())
    .filter((id) => !idsDocumentados.includes(id))
    .map((id) => `${onde}: regra ${id} não existe nas tabelas de docs/domains`);
}

function problemasDeTeste(
  onde: string,
  teste: string,
  lerArquivo: (caminho: string) => string | null,
): string[] {
  if (/^n\/a\b/.test(teste)) {
    return MOTIVO_NA.test(teste) ? [] : [`${onde}: n/a sem motivo`];
  }
  const citados = testesCitados(teste);
  if (citados.length === 0) {
    return [`${onde}: não cita teste nem n/a com motivo`];
  }
  const problemas: string[] = [];
  for (const { arquivo, titulo } of citados) {
    const conteudo = lerArquivo(arquivo);
    if (conteudo === null) {
      problemas.push(`${onde}: arquivo ${arquivo} não existe`);
    } else if (!conteudo.includes(titulo)) {
      problemas.push(`${onde}: teste "${titulo}" não está em ${arquivo}`);
    }
  }
  return problemas;
}
