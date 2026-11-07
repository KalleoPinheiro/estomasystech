import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Trava de acessibilidade da identidade visual (#424, WCAG 2.2 AA).
 *
 * Lê os tokens publicados em `@still-void/ui/theme.css` (o que o app realmente
 * recebe) e confere o contraste dos pares usados nas telas, nas 4 cores de acento
 * × 2 modos. Um par abaixo do limiar falha com o nome do par, do modo e da cor.
 */

const TEXT_MIN = 4.5;
const DOT_MIN = 3; // elemento gráfico (WCAG 1.4.11)
const AA_TINT = 0.1; // fundo tingido: no máximo 10% da cor sobre a superfície
const ACCENTS = ['cyan', 'violet', 'mint', 'amber'] as const;
const STATES = ['danger', 'success', 'info', 'warning'] as const;
const SURFACES = ['bg', 'bg-elev', 'surface', 'surface-2'] as const;
// Texto de botão de acento no app (`btn pri`): `--sv-bg` escuro sobre o acento de superfície.
const ON_ACCENT = '#0a0a0c';

type Rgb = [number, number, number];
type Tokens = Record<string, string>;
type Mode = 'dark' | 'light';

const css = readFileSync(
  new URL('../../node_modules/@still-void/ui/dist/theme.css', import.meta.url),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector: string): Tokens {
  const start = css.indexOf(`${selector} {`);
  if (start < 0)
    throw new Error(`Bloco ${selector} não encontrado em theme.css`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const tokens: Tokens = {};
  for (const [, name, value] of body.matchAll(/(--sv-[\w-]+):\s*([^;]+);/g)) {
    tokens[name as string] = (value as string).trim();
  }
  return tokens;
}

const dark = block(':root');
const TOKENS: Record<Mode, Tokens> = {
  dark,
  light: { ...dark, ...block("[data-theme='light']") },
};

function token(mode: Mode, name: string): string {
  let value = TOKENS[mode][`--sv-${name}`];
  if (value === undefined)
    throw new Error(`Token --sv-${name} ausente no modo ${mode}`);
  for (let hops = 0; value.startsWith('var('); hops++) {
    const ref = /var\((--sv-[\w-]+)\)/.exec(value)?.[1] as string;
    value = TOKENS[mode][ref] ?? '';
    if (hops > 5 || value === '')
      throw new Error(`Referência quebrada em --sv-${name}`);
  }
  return value;
}

function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const gamma = (x: number) =>
    x <= 0.0031308 ? 12.92 * x : 1.055 * Math.max(x, 0) ** (1 / 2.4) - 0.055;
  return lin.map((v) => Math.min(1, Math.max(0, gamma(v)))) as Rgb;
}

function parse(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = hex[1] as string;
    return [0, 2, 4].map(
      (i) => Number.parseInt(n.slice(i, i + 2), 16) / 255,
    ) as Rgb;
  }
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(value);
  if (ok) return oklchToRgb(Number(ok[1]), Number(ok[2]), Number(ok[3]));
  throw new Error(`Cor não suportada no teste de contraste: ${value}`);
}

function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

function tint(base: Rgb, surface: Rgb): Rgb {
  return base.map(
    (v, i) => v * AA_TINT + (surface[i] as number) * (1 - AA_TINT),
  ) as Rgb;
}

function rgb(mode: Mode, name: string): Rgb {
  return parse(token(mode, name));
}

describe.each(['light', 'dark'] as const)(
  'Feature: Contraste do tema no modo %s (WCAG 2.2 AA)',
  (mode) => {
    it.each(['text', 'text-2', 'text-3'])(
      'Dado o texto --sv-%s, Quando sobre cada superfície, Então passa de 4,5:1',
      (name) => {
        for (const surface of SURFACES) {
          const value = ratio(rgb(mode, name), rgb(mode, surface));
          expect(
            value,
            `${mode}: ${name} sobre ${surface} = ${value.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(TEXT_MIN);
        }
      },
    );

    it.each(ACCENTS)(
      'Dado o acento %s como texto, Quando sobre cada superfície e sobre a tinta de 10%, Então passa de 4,5:1',
      (accent) => {
        const ink = rgb(mode, `accent-${accent}-ink`);
        for (const surface of SURFACES) {
          const flat = ratio(ink, rgb(mode, surface));
          expect(
            flat,
            `${mode}: acento ${accent} sobre ${surface} = ${flat.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(TEXT_MIN);
          const tinted = ratio(
            ink,
            tint(rgb(mode, `accent-${accent}`), rgb(mode, surface)),
          );
          expect(
            tinted,
            `${mode}: acento ${accent} sobre tinta de ${surface} = ${tinted.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(TEXT_MIN);
        }
      },
    );

    it.each(ACCENTS)(
      'Dado o botão de acento %s, Quando o texto é #0a0a0c, Então passa de 4,5:1 sobre o acento',
      (accent) => {
        const value = ratio(parse(ON_ACCENT), rgb(mode, `accent-${accent}`));
        expect(
          value,
          `${mode}: texto do botão sobre acento ${accent} = ${value.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(TEXT_MIN);
      },
    );

    it.each(STATES)(
      'Dado o selo de estado %s, Quando o texto é a tinta do estado, Então passa de 4,5:1 sobre a superfície e sobre a tinta de 10%',
      (state) => {
        const ink = rgb(mode, `${state}-ink`);
        for (const surface of SURFACES) {
          const flat = ratio(ink, rgb(mode, surface));
          expect(
            flat,
            `${mode}: ${state} sobre ${surface} = ${flat.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(TEXT_MIN);
          const tinted = ratio(ink, tint(rgb(mode, state), rgb(mode, surface)));
          expect(
            tinted,
            `${mode}: ${state} sobre tinta de ${surface} = ${tinted.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(TEXT_MIN);
        }
      },
    );

    it.each([
      ['scheduled', 'info-ink'],
      ['confirmed', 'accent-violet-ink'],
      ['completed', 'success-ink'],
      ['cancelled', 'text-3'],
      ['no_show', 'warning-ink'],
    ])(
      'Dado o ponto do chip de status %s, Quando preenchido com --sv-%s, Então passa de 3:1 (WCAG 1.4.11) sobre o chip e sobre o chip marcado (#707)',
      (_status, name) => {
        const dot = rgb(mode, name);
        const checked = tint(rgb(mode, 'accent-violet'), rgb(mode, 'bg'));
        for (const surface of SURFACES) {
          const value = ratio(dot, rgb(mode, surface));
          expect(
            value,
            `${mode}: ponto ${name} sobre ${surface} = ${value.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(DOT_MIN);
        }
        const onChecked = ratio(dot, checked);
        expect(
          onChecked,
          `${mode}: ponto ${name} sobre chip marcado = ${onChecked.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(DOT_MIN);
      },
    );
  },
);
