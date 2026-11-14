/**
 * Leitura de `git diff -z`: caminhos separados por NUL, sem as aspas do `core.quotePath`.
 * Nome com acento, espaço, aspas ou quebra de linha chega íntegro para o classificador.
 */

/** Caminhos de `git diff --name-only -z`. */
export const arquivosDeNul = (texto: string): string[] => texto.split('\0').filter((a) => a !== '');

/**
 * Pares de `git diff --name-status -z` com `--no-renames`: status e caminho.
 * Rename ou cópia (R/C) ocupa três campos; devolve o caminho novo. Saída truncada lança erro (falha fechada): nunca
 * descarta o resto da lista em silêncio.
 */
export function mudancasDeNul(texto: string): [string, string][] {
  const partes = texto.split('\0');
  if (partes.at(-1) === '') partes.pop();
  const saida: [string, string][] = [];
  for (let i = 0; i < partes.length; ) {
    const status = partes[i] ?? '';
    const caminho = partes[i + 1];
    if (caminho === undefined || caminho === '') throw new Error(`saída de git diff -z malformada: sem caminho depois do status "${status}"`);
    if (status.startsWith('R') || status.startsWith('C')) {
      const novo = partes[i + 2];
      if (novo === undefined || novo === '') throw new Error(`saída de git diff -z malformada: rename/cópia "${status}" sem o caminho novo`);
      saida.push([status, novo]);
      i += 3;
      continue;
    }
    saida.push([status, caminho]);
    i += 2;
  }
  return saida;
}
