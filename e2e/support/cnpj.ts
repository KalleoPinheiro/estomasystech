const WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function digit(chars: string): number {
  const weights = WEIGHTS.slice(WEIGHTS.length - chars.length);
  const sum = [...chars].reduce(
    (acc, char, i) => acc + (char.charCodeAt(0) - 48) * (weights[i] as number),
    0,
  );
  return sum % 11 < 2 ? 0 : 11 - (sum % 11);
}

/** CNPJ canônico válido a partir dos 12 primeiros caracteres (fixtures de teste). */
export function validCnpj(base: string): string {
  const first = digit(base);
  const dv = `${first}${digit(`${base}${first}`)}`;
  return `${base.slice(0, 2)}.${base.slice(2, 5)}.${base.slice(5, 8)}/${base.slice(8, 12)}-${dv}`;
}
