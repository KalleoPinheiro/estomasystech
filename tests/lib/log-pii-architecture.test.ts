import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #381, ADR-059: a redação central pega o que o chamador esquece, mas nome,
 * e-mail e documento em mensagem de log são texto livre — não há como
 * detectá-los depois. Mensagem de `logger.*`/`logError` só interpola id (ou
 * contato mascarado por `maskEmail`/`maskPhone`).
 */
const SRC_ROOT = path.join(process.cwd(), 'src');
const LOG_CALL = /(?:logger\.(?:info|warn|error)|logError)\(\s*`([^`]*)`/g;
const INTERPOLATION = /\$\{([^}]*)\}/g;
const PERSONAL =
  /email|phone|telefone|cpf|cnpj|nome|document|(?:patient|user|guardian|professional|partner|person|full|first|last|contact|recipient)\.?name/i;
const MASKED = /mask(?:Email|Phone)\(/;

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Interpolações de dado pessoal sem máscara, em mensagens de log. */
function personalInterpolations(source: string): string[] {
  const found: string[] = [];
  for (const call of source.matchAll(LOG_CALL)) {
    for (const part of call[1].matchAll(INTERPOLATION)) {
      if (PERSONAL.test(part[1]) && !MASKED.test(part[1])) {
        found.push(part[1].trim());
      }
    }
  }
  return found;
}

/** `@{x}` vira `${x}`: evita o literal de template dentro de string comum. */
const code = (source: string) => source.replaceAll('@{', '${');

describe('Arquitetura: mensagem de log sem dado pessoal (#381)', () => {
  it('C17 nenhuma mensagem interpola nome, e-mail, CPF ou telefone sem máscara', () => {
    const offenders = collectSourceFiles(SRC_ROOT).flatMap((file) =>
      personalInterpolations(readFileSync(file, 'utf8')).map(
        (expr) => `${path.relative(SRC_ROOT, file)}: \${${expr}}`,
      ),
    );

    expect(offenders).toEqual([]);
  });

  it('Dado interpolação de e-mail cru, Quando varrer, Então o teste a acusa', () => {
    expect(
      personalInterpolations(code('logger.warn(`falha para @{user.email}`)')),
    ).toEqual(['user.email']);
    expect(
      personalInterpolations(
        code('logError(`falha @{maskEmail(user.email)}`, e)'),
      ),
    ).toEqual([]);
    expect(
      personalInterpolations(code('logger.info(`conta @{account.id}`)')),
    ).toEqual([]);
  });
});
