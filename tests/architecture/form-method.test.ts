import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Único arquivo que pode declarar `<form>` sem passar por `SafeForm`. */
const ALLOWED = new Set(['src/components/safe-form.tsx']);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

/** Abertura `<form ...>` até o `>` que a fecha, atravessando linhas. */
const FORM_OPENING = /<form(?=[\s>])[^>]*>/g;

describe('Arquitetura: formulário sem method vaza na URL (#777)', () => {
  it('Dado o código de src/, quando procuro <form> cru, então todo <form> declara method="post" ou usa SafeForm', () => {
    const offenders = tsxFiles('src')
      .map((file) => file.split(path.sep).join('/'))
      .filter((file) => !ALLOWED.has(file))
      .flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(FORM_OPENING)]
          .filter(([opening]) => !/\bmethod=["{']/.test(opening))
          .map(() => file),
      );

    expect(offenders).toEqual([]);
  });

  it('Dado um <form> sem method, quando aplico a regra, então ele é reprovado', () => {
    const cru = '<form onSubmit={handleSubmit}>';
    const comMetodo = '<form method="post" onSubmit={handleSubmit}>';

    expect(cru.match(FORM_OPENING)).toHaveLength(1);
    expect(/\bmethod=["{']/.test(cru)).toBe(false);
    expect(/\bmethod=["{']/.test(comMetodo)).toBe(true);
  });
});
