/**
 * `npm run handoff:agregar` — junta o histórico congelado (`handoff-2026.md`) e `.specs/archive/handoff/*.md` em
 * `reports/handoff-agregado.md` (ignorado pelo git). Só para leitura; ninguém edita o arquivo gerado (ADR-102).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { agregarHandoffs, DIR_HANDOFF, HANDOFF_CONGELADO } from './handoff-lib';

const arquivos = readdirSync(DIR_HANDOFF)
  .filter((n) => n.endsWith('.md'))
  .map((n) => ({ caminho: `${DIR_HANDOFF}/${n}`, conteudo: readFileSync(`${DIR_HANDOFF}/${n}`, 'utf8') }));

mkdirSync('reports', { recursive: true });
writeFileSync('reports/handoff-agregado.md', agregarHandoffs(readFileSync(HANDOFF_CONGELADO, 'utf8'), arquivos));
console.log(`✓ reports/handoff-agregado.md (${arquivos.length} handoff(s) por issue)`);
