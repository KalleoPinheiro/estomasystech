/**
 * Critério de cada opção da avaliação de ferida (#955), mostrado como legenda curta sob o campo.
 *
 * Fontes: modelos de avaliação da clínica (docs/clinico/aceleradores-estomaterapia.md § 2.1), PUSH 3.0 (tecido),
 * IWII 2022 (continuum de infecção) e consenso WUWHS de exsudato (quantidade pela saturação da cobertura).
 * O texto é descritivo: não muda nenhuma regra de validação nem o que é gravado.
 */

/** Quantidade de exsudato pela saturação da cobertura retirada. */
export const EXUDATE_CRITERIA: Record<string, string> = {
  none: 'Leito seco; a cobertura sai sem umidade.',
  low: 'Menos de 25% da cobertura saturada.',
  moderate: 'De 25% a 75% da cobertura saturada.',
  high: 'Mais de 75% da cobertura saturada ou vazando.',
};

/** Tecido predominante no leito (PUSH 3.0). */
export const TISSUE_TYPE_CRITERIA: Record<string, string> = {
  closed: 'Ferida fechada, coberta por epitélio.',
  epithelial: 'Tecido novo rosado e brilhante, nas bordas ou em ilhas.',
  granulation: 'Tecido vermelho vivo, úmido e de aspecto granuloso.',
  slough: 'Tecido amarelo ou esbranquiçado, aderido ao leito, mole ou fibroso.',
  necrotic: 'Tecido preto, marrom ou acinzentado, endurecido ou amolecido.',
};

/** Nível do continuum de infecção (IWII 2022). */
export const INFECTION_LEVEL_CRITERIA: Record<string, string> = {
  none: 'Sem sinais locais nem sistêmicos.',
  inflammation:
    'Eritema, calor e edema discretos, esperados na cicatrização, sem outros sinais.',
  local:
    'Sinais no leito e até 2 cm da borda: exsudato aumentado, odor, granulação friável, dor nova, cicatrização estagnada.',
  spreading:
    'Sinais além de 2 cm da borda: eritema em expansão, linfangite, crepitação ou deiscência.',
  systemic:
    'Febre, mal-estar, hipotensão ou sinais de sepse: encaminhar na hora.',
};

/** Aspecto da drenagem. */
export const EXUDATE_TYPE_CRITERIA: Record<string, string> = {
  serous: 'Claro e aquoso, cor de palha.',
  serosanguineous: 'Ralo, rosado ou levemente avermelhado.',
  sanguineous: 'Vermelho, com sangue vivo.',
  purulent: 'Espesso, amarelo, esverdeado ou marrom, às vezes com odor.',
};

/** Bordas da ferida. */
export const WOUND_EDGE_CRITERIA: Record<string, string> = {
  attached: 'Borda no nível do leito e unida a ele.',
  detached: 'Borda separada do leito, sem aderência.',
  rolled: 'Borda enrolada para dentro e espessa, que trava a epitelização.',
  macerated: 'Borda esbranquiçada e amolecida pela umidade.',
  undermined: 'Cavidade sob a borda, com a pele de cima íntegra.',
  hyperkeratotic: 'Borda com calo, pele espessa e endurecida.',
  epithelializing: 'Tecido novo rosado avançando a partir da borda.',
};

/** Texto da legenda: o critério da opção escolhida ou, sem escolha, o convite a escolher. */
export function criterionHint(
  criteria: Record<string, string>,
  value: string,
  emptyHint: string,
): string {
  return criteria[value] ?? emptyHint;
}

export const TISSUE_PERCENT_MAX = 100;

/** Soma dos percentuais de tecido informados; null quando nenhum foi preenchido. */
export function tissuePercentTotal(values: readonly string[]): number | null {
  const informed = values
    .filter((value) => value.trim() !== '')
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (informed.length === 0) {
    return null;
  }
  return informed.reduce((sum, value) => sum + value, 0);
}
