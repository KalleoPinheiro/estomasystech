import { ValidationError } from '../shared/errors';

/**
 * Sanitização de SVG enviado como logo ou avatar (#427). SVG é XML executável:
 * a defesa vive aqui (envio), na entrega (CSP `sandbox`) e na exibição (só por
 * `<img>`). O arquivo gravado é sempre reconstruído a partir de uma allowlist —
 * nunca é o texto original.
 *
 * Dois níveis, para o erro ser claro:
 * - conteúdo ativo (script, foreignObject, `on*`, `javascript:`, href externo,
 *   entidade, `url()` externo) rejeita o arquivo inteiro;
 * - sobra inofensiva de editor (metadata, `sodipodi:*`, comentários, `<?xml?>`)
 *   é descartada em silêncio.
 */

export const MAX_SVG_ELEMENTS = 5000;
export const MAX_SVG_DEPTH = 64;

const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'symbol',
  'use',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'style',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
]);

/** Elementos que executam código ou buscam recurso externo: rejeitam o arquivo. */
const FORBIDDEN_ELEMENTS = new Set([
  'script',
  'foreignObject',
  'iframe',
  'object',
  'embed',
  'image',
  'animate',
  'animateMotion',
  'animateTransform',
  'set',
  'handler',
  'listener',
  'audio',
  'video',
  'canvas',
  'link',
  'feImage',
]);

const ALLOWED_ATTRIBUTES = new Set([
  'id',
  'class',
  'x',
  'y',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'fx',
  'fy',
  'dx',
  'dy',
  'points',
  'd',
  'pathLength',
  'viewBox',
  'preserveAspectRatio',
  'transform',
  'transform-origin',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'color',
  'display',
  'visibility',
  'vector-effect',
  'shape-rendering',
  'clip-path',
  'clip-rule',
  'mask',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'patternUnits',
  'patternTransform',
  'patternContentUnits',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'rotate',
  'xml:space',
  'version',
  'style',
  'href',
  'xlink:href',
  'xmlns',
  'xmlns:xlink',
]);

const STYLE_PROPERTIES = new Set(
  [...ALLOWED_ATTRIBUTES].filter(
    (name) => !['style', 'href', 'xlink:href', 'class', 'id'].includes(name),
  ),
);

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const TEXT_ELEMENTS = new Set(['text', 'tspan', 'title', 'desc', 'style']);
const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[A-Za-z0-9_:.-]/;
const FRAGMENT_REF = /^#[A-Za-z_][\w.:-]*$/;
const URL_FRAGMENT = /^url\(\s*(['"]?)#[A-Za-z_][\w.:-]*\1\s*\)$/;

const reject = (reason: string): never => {
  throw new ValidationError(`SVG não aceito: ${reason}`);
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const CODE_POINT_LIMIT = 0x10ffff;

/** Decodifica só as 5 entidades predefinidas e as numéricas; qualquer outra rejeita. */
function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g,
    (_m, body: string) => {
      if (body.startsWith('#')) {
        const code =
          body[1] === 'x'
            ? Number.parseInt(body.slice(2), 16)
            : Number(body.slice(1));
        if (!Number.isInteger(code) || code <= 0 || code > CODE_POINT_LIMIT) {
          return reject('referência numérica inválida');
        }
        return String.fromCodePoint(code);
      }
      return (
        NAMED_ENTITIES[body] ?? reject(`entidade &${body}; não é permitida`)
      );
    },
  );
}

const escapeText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttribute = (value: string): string =>
  escapeText(value).replace(/"/g, '&quot;');

/** Remove controle e espaço para que `java\tscript:` não escape da checagem. */
const compact = (value: string): string =>
  [...value]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 0x20 && (code < 0x7f || code > 0x9f);
    })
    .join('')
    .toLowerCase();

/** Valor de atributo ou de declaração CSS: sem script, sem recurso externo. */
function assertSafeValue(value: string): void {
  const flat = compact(value);
  if (
    /javascript:|vbscript:|data:|expression\(|behavior:|-moz-binding|@import|image-set\(|cross-fade\(|element\(|paint\(|\\/.test(
      flat,
    ) ||
    value.includes('<')
  ) {
    reject('conteúdo ativo em um valor');
  }
  for (const match of value.matchAll(/url\(([^)]*)\)/gi)) {
    if (!URL_FRAGMENT.test(match[0].trim())) {
      reject('referência externa em url()');
    }
  }
}

function sanitizeStyleAttribute(value: string): string {
  const kept: string[] = [];
  for (const declaration of value.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const body = declaration.slice(colon + 1).trim();
    assertSafeValue(body);
    if (STYLE_PROPERTIES.has(property) && body) {
      kept.push(`${property}:${body}`);
    }
  }
  return kept.join(';');
}

/** CSS de `<style>`: sem at-rule, sem URL externa, sem escape. Rejeita em vez de remendar. */
function sanitizeStyleElement(css: string): string {
  if (/@/.test(css)) reject('<style> com at-rule (@import, @font-face)');
  assertSafeValue(css);
  return css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

interface ParsedElement {
  name: string;
  attributes: [string, string][];
  children: (ParsedElement | string)[];
}

class Cursor {
  position = 0;
  elements = 0;
  constructor(readonly text: string) {}

  startsWith(token: string): boolean {
    return this.text.startsWith(token, this.position);
  }

  skipPast(token: string, what: string): string {
    const end = this.text.indexOf(token, this.position);
    if (end < 0) reject(`${what} sem fechamento`);
    const body = this.text.slice(this.position, end);
    this.position = end + token.length;
    return body;
  }

  skipSpace(): void {
    while (/\s/.test(this.text[this.position] ?? '')) this.position += 1;
  }

  readName(): string {
    const start = this.position;
    if (!NAME_START.test(this.text[start] ?? '')) reject('marcação malformada');
    this.position += 1;
    while (NAME_CHAR.test(this.text[this.position] ?? '')) this.position += 1;
    return this.text.slice(start, this.position);
  }
}

function readAttributes(cursor: Cursor): {
  attributes: [string, string][];
  selfClosing: boolean;
} {
  const attributes: [string, string][] = [];
  const seen = new Set<string>();
  for (;;) {
    cursor.skipSpace();
    if (cursor.startsWith('/>')) {
      cursor.position += 2;
      return { attributes, selfClosing: true };
    }
    if (cursor.startsWith('>')) {
      cursor.position += 1;
      return { attributes, selfClosing: false };
    }
    const name = cursor.readName();
    cursor.skipSpace();
    if (cursor.text[cursor.position] !== '=') reject('atributo sem valor');
    cursor.position += 1;
    cursor.skipSpace();
    const quote = cursor.text[cursor.position];
    if (quote !== '"' && quote !== "'") reject('atributo sem aspas');
    cursor.position += 1;
    const raw = cursor.skipPast(quote as string, 'valor de atributo');
    if (raw.includes('<')) reject('"<" dentro de valor de atributo');
    if (seen.has(name)) reject(`atributo ${name} repetido`);
    seen.add(name);
    attributes.push([name, decodeEntities(raw)]);
  }
}

function readText(cursor: Cursor): string {
  const end = cursor.text.indexOf('<', cursor.position);
  const stop = end < 0 ? cursor.text.length : end;
  const raw = cursor.text.slice(cursor.position, stop);
  cursor.position = stop;
  return decodeEntities(raw);
}

/** Consome marcação que não vira elemento; devolve texto de CDATA ou `null`. */
function readSpecial(cursor: Cursor): string | null {
  if (cursor.startsWith('<!--')) {
    cursor.position += 4;
    cursor.skipPast('-->', 'comentário');
    return null;
  }
  if (cursor.startsWith('<![CDATA[')) {
    cursor.position += 9;
    return cursor.skipPast(']]>', 'CDATA');
  }
  if (cursor.startsWith('<?')) {
    cursor.position += 2;
    cursor.skipPast('?>', 'instrução de processamento');
    return null;
  }
  // Só chega aqui com `<!`: o que não for DOCTYPE simples é recusado.
  const declaration = cursor.skipPast('>', 'declaração');
  if (!/^<!DOCTYPE/i.test(declaration)) reject('declaração não permitida');
  if (declaration.includes('[') || /ENTITY/i.test(declaration)) {
    reject('DOCTYPE com subconjunto interno ou entidade');
  }
  return null;
}

function parseElement(cursor: Cursor, depth: number): ParsedElement {
  if (depth > MAX_SVG_DEPTH) reject('aninhamento profundo demais');
  cursor.elements += 1;
  if (cursor.elements > MAX_SVG_ELEMENTS) reject('elementos demais');
  cursor.position += 1; // "<"
  const name = cursor.readName();
  const { attributes, selfClosing } = readAttributes(cursor);
  const element: ParsedElement = { name, attributes, children: [] };
  if (selfClosing) return element;
  for (;;) {
    if (cursor.position >= cursor.text.length)
      reject('elemento sem fechamento');
    if (cursor.startsWith('</')) {
      cursor.position += 2;
      const closing = cursor.readName();
      cursor.skipSpace();
      if (closing !== name || cursor.text[cursor.position] !== '>') {
        reject('marcação malformada');
      }
      cursor.position += 1;
      return element;
    }
    if (cursor.startsWith('<!') || cursor.startsWith('<?')) {
      const cdata = readSpecial(cursor);
      if (cdata !== null) element.children.push(cdata);
      continue;
    }
    if (cursor.startsWith('<')) {
      element.children.push(parseElement(cursor, depth + 1));
      continue;
    }
    element.children.push(readText(cursor));
  }
}

function sanitizeAttribute(name: string, value: string): string | null {
  if (/^on/i.test(name)) reject(`atributo ${name} (evento) não é permitido`);
  if (name === 'xmlns') return value === SVG_NS ? value : null;
  if (name === 'xmlns:xlink') return value === XLINK_NS ? value : null;
  if (!ALLOWED_ATTRIBUTES.has(name)) return null;
  if (name === 'href' || name === 'xlink:href') {
    if (!FRAGMENT_REF.test(value.trim())) reject('link externo em href');
    return value.trim();
  }
  if (name === 'style') return sanitizeStyleAttribute(value);
  assertSafeValue(value);
  return value;
}

function assertNoActiveContent(element: ParsedElement): void {
  if (FORBIDDEN_ELEMENTS.has(element.name)) {
    reject(`elemento <${element.name}> não é permitido`);
  }
  for (const [name] of element.attributes) {
    if (/^on/i.test(name)) reject(`atributo ${name} (evento) não é permitido`);
  }
  for (const child of element.children) {
    if (typeof child !== 'string') assertNoActiveContent(child);
  }
}

function renderElement(element: ParsedElement): string {
  if (FORBIDDEN_ELEMENTS.has(element.name)) {
    reject(`elemento <${element.name}> não é permitido`);
  }
  if (!ALLOWED_ELEMENTS.has(element.name)) {
    // Sai do arquivo, mas conteúdo ativo escondido nele ainda recusa o envio.
    assertNoActiveContent(element);
    return '';
  }
  const attributes = element.attributes
    .map(([name, value]) => [name, sanitizeAttribute(name, value)] as const)
    .filter((pair): pair is readonly [string, string] => pair[1] !== null)
    .filter(([name]) => name !== 'xmlns' && name !== 'xmlns:xlink');
  if (element.name === 'svg') {
    attributes.unshift(['xmlns', SVG_NS], ['xmlns:xlink', XLINK_NS]);
  }
  const open = attributes
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
  const body = element.children
    .map((child) => renderChild(element, child))
    .join('');
  return body
    ? `<${element.name}${open}>${body}</${element.name}>`
    : `<${element.name}${open}/>`;
}

function renderChild(
  parent: ParsedElement,
  child: ParsedElement | string,
): string {
  if (typeof child !== 'string') return renderElement(child);
  if (!TEXT_ELEMENTS.has(parent.name)) return '';
  if (parent.name === 'style') return escapeText(sanitizeStyleElement(child));
  return escapeText(child);
}

/** Devolve o SVG limpo e reconstruído; lança `ValidationError` se houver conteúdo ativo. */
export function sanitizeSvg(raw: string): string {
  const cursor = new Cursor(raw.replace(/^﻿/, ''));
  let root: ParsedElement | null = null;
  while (cursor.position < cursor.text.length) {
    cursor.skipSpace();
    if (cursor.position >= cursor.text.length) break;
    if (cursor.startsWith('<!') || cursor.startsWith('<?')) {
      readSpecial(cursor);
      continue;
    }
    if (!cursor.startsWith('<') || root)
      reject('conteúdo fora do elemento <svg>');
    root = parseElement(cursor, 0);
  }
  if (!root || root.name !== 'svg') reject('o elemento raiz precisa ser <svg>');
  return renderElement(root as ParsedElement);
}
