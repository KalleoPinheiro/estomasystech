/**
 * `tsx scripts/release/migrar-producao.ts plano <estado.txt> <saida.sql> [pasta]`
 * `tsx scripts/release/migrar-producao.ts verificar <estado.txt> [pasta]`
 *
 * Casca do ADR-113 sobre `migrar-producao-lib.ts`. `plano` imprime `PENDENTES=<n>` e `NAO_ADITIVAS=<tags|nenhuma>`
 * e grava em <saida.sql> o SQL a aplicar; sai 1 se houver buraco no journal (migração ausente mais antiga que a
 * última aplicada, que o Drizzle pularia para sempre). `verificar` sai 1 se, depois de migrar, algo do journal
 * ainda não estiver na tabela do Drizzle ou na função do readiness. Sem banco, sem rede e sem segredo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import {
  faltandoDepoisDeMigrar,
  type MigracaoDoJournal,
  montarSql,
  naoAditivas,
  parseEstado,
  planejar,
} from './migrar-producao-lib';

function lerJournal(pasta: string): MigracaoDoJournal[] {
  const entradas = (
    JSON.parse(readFileSync(path.join(pasta, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string }[] }
  ).entries;
  return readMigrationFiles({ migrationsFolder: pasta }).map((m, i) => ({
    tag: entradas[i]?.tag ?? `migracao-${i}`,
    when: m.folderMillis,
    hash: m.hash,
    instrucoes: m.sql,
  }));
}

function sair(mensagem: string): never {
  console.error(`::error title=Migração de produção::${mensagem}`);
  process.exit(1);
}

const [comando, estadoArquivo, terceiro, quarto] = process.argv.slice(2);
if (!estadoArquivo) sair('uso: plano <estado.txt> <saida.sql> [pasta] | verificar <estado.txt> [pasta]');

try {
  const estado = parseEstado(readFileSync(estadoArquivo, 'utf8'));
  if (comando === 'plano') {
    if (!terceiro) sair('plano exige o caminho do SQL de saída');
    const pasta = quarto ?? 'drizzle';
    const journal = lerJournal(pasta);
    const { pendentes, buracos } = planejar(journal, estado);
    if (buracos.length > 0) {
      sair(
        `o banco não tem ${buracos.map((m) => m.tag).join(', ')}, mais antiga(s) que a última aplicada: o Drizzle as pularia para sempre. Corrija o banco à mão antes de publicar (producao.md § 4).`,
      );
    }
    writeFileSync(terceiro, montarSql(pendentes));
    const nao = naoAditivas(pendentes, (tag) => readFileSync(path.join(pasta, `${tag}.sql`), 'utf8'));
    console.log(`PENDENTES=${pendentes.length}`);
    console.log(`TAGS=${pendentes.map((m) => m.tag).join(',') || 'nenhuma'}`);
    console.log(`NAO_ADITIVAS=${nao.join(',') || 'nenhuma'}`);
  } else if (comando === 'verificar') {
    const faltando = faltandoDepoisDeMigrar(lerJournal(terceiro ?? 'drizzle'), estado);
    if (faltando.length > 0) sair(`o banco ainda deixa migração pendente: ${faltando.join('; ')}`);
    console.log('SEM_PENDENCIAS');
  } else {
    sair(`comando desconhecido: ${comando}`);
  }
} catch (erro) {
  sair((erro as Error).message);
}
