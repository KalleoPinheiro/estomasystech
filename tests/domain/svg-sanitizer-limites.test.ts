import { describe, expect, it } from 'vitest';
import {
  MAX_SVG_DEPTH,
  MAX_SVG_ELEMENTS,
  sanitizeSvg,
} from '@/domain/clinic/svg-sanitizer';
import { ValidationError } from '@/domain/shared/errors';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const XL = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
const svg = (inner: string, attrs = '') => `<svg ${NS} ${attrs}>${inner}</svg>`;
const rejectsWith = (source: string, message: string) =>
  expect(() => sanitizeSvg(source)).toThrow(message);

const ELEMENTOS = [
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
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
];

const ATRIBUTOS = [
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
];

const PROIBIDOS = [
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
];

describe('Feature: a allowlist do sanitizador é exata (#427)', () => {
  describe.each(ELEMENTOS)('Cenário: elemento <%s> permitido', (nome) => {
    it('Dado o elemento, Quando sanitiza, Então ele permanece no arquivo', () => {
      expect(sanitizeSvg(svg(`<${nome}/>`))).toContain(`<${nome}/>`);
    });
  });

  describe.each(ATRIBUTOS)('Cenário: atributo %s permitido', (nome) => {
    it('Dado o atributo, Quando sanitiza, Então o valor permanece', () => {
      expect(sanitizeSvg(svg(`<g ${nome}="1"/>`))).toContain(`${nome}="1"`);
    });
  });

  describe.each(PROIBIDOS)('Cenário: elemento <%s> proibido', (nome) => {
    it(`Dado <${nome}>, Quando sanitiza, Então rejeita com o nome do elemento`, () => {
      rejectsWith(svg(`<${nome}/>`), `elemento <${nome}> não é permitido`);
    });

    it(`Dado <${nome}> dentro de elemento descartado, Quando sanitiza, Então ainda rejeita`, () => {
      rejectsWith(
        svg(`<metadata><${nome}/></metadata>`),
        `elemento <${nome}> não é permitido`,
      );
    });
  });

  it('Dado class e id, Quando sanitiza, Então ambos permanecem e não viram propriedade de style', () => {
    const out = sanitizeSvg(
      svg('<g id="a" class="b" style="id:1;class:2;fill:red"/>'),
    );
    expect(out).toContain('id="a"');
    expect(out).toContain('class="b"');
    expect(out).toContain('style="fill:red"');
  });

  it('Dado style com href, Quando sanitiza, Então a propriedade é descartada', () => {
    expect(sanitizeSvg(svg('<g style="href:x;stroke:blue"/>'))).toContain(
      'style="stroke:blue"',
    );
  });
});

describe('Feature: mensagens de erro do sanitizador dizem o motivo (#427)', () => {
  const casos: [string, string, string][] = [
    [
      'entidade numérica zero',
      svg('<title>&#0;</title>'),
      'referência numérica inválida',
    ],
    [
      'entidade hex zero',
      svg('<title>&#x0;</title>'),
      'referência numérica inválida',
    ],
    [
      'entidade fora do Unicode',
      svg('<title>&#x110000;</title>'),
      'referência numérica inválida',
    ],
    [
      'entidade nomeada',
      svg('<title>&nbsp;</title>'),
      'entidade &nbsp; não é permitida',
    ],
    [
      'javascript em valor',
      svg('<g fill="javascript:x"/>'),
      'conteúdo ativo em um valor',
    ],
    [
      '< em valor via entidade',
      svg('<g fill="&lt;x"/>'),
      'conteúdo ativo em um valor',
    ],
    [
      'url externa',
      svg('<g fill="url(https://x.test/a)"/>'),
      'referência externa em url()',
    ],
    [
      'style com at-rule',
      svg('<style>@import "x";</style>'),
      '<style> com at-rule',
    ],
    ['comentário aberto', `<svg ${NS}><!-- x`, 'comentário sem fechamento'],
    ['CDATA aberto', svg('<title><![CDATA[x</title>'), 'CDATA sem fechamento'],
    [
      'PI aberta',
      `<svg ${NS}><?x`,
      'instrução de processamento sem fechamento',
    ],
    ['declaração aberta', `<svg ${NS}><!X`, 'declaração sem fechamento'],
    ['declaração não DOCTYPE', svg('<!ELEMENT x>'), 'declaração não permitida'],
    [
      'DOCTYPE com subconjunto',
      `<!DOCTYPE svg [<!ENTITY a "b">]>${svg('')}`,
      'DOCTYPE com subconjunto interno ou entidade',
    ],
    [
      'DOCTYPE com ENTITY sem colchete',
      `<!DOCTYPE svg SYSTEM "entity">${svg('')}`,
      'DOCTYPE',
    ],
    ['atributo sem valor', `<svg ${NS} a>`, 'atributo sem valor'],
    ['atributo sem aspas', `<svg ${NS} a=1>`, 'atributo sem aspas'],
    ['valor com <', `<svg ${NS} a="<">`, '"<" dentro de valor de atributo'],
    ['atributo repetido', `<svg ${NS} a="1" a="2">`, 'atributo a repetido'],
    ['nome inválido', `<svg ${NS}><1/></svg>`, 'marcação malformada'],
    ['elemento aberto', `<svg ${NS}><g>`, 'elemento sem fechamento'],
    ['fechamento trocado', `<svg ${NS}></g></svg>`, 'marcação malformada'],
    ['fechamento sem >', `<svg ${NS}></svg`, 'marcação malformada'],
    [
      'href externo',
      svg('<use href="https://x.test/a"/>'),
      'link externo em href',
    ],
    [
      'evento',
      svg('<g onclick="x"/>'),
      'atributo onclick (evento) não é permitido',
    ],
    [
      'evento escondido',
      svg('<metadata><g onclick="x"/></metadata>'),
      'atributo onclick (evento) não é permitido',
    ],
    ['texto fora do svg', `${svg('')}x`, 'conteúdo fora do elemento <svg>'],
    ['segundo raiz', `${svg('')}${svg('')}`, 'conteúdo fora do elemento <svg>'],
    ['raiz não svg', '<html/>', 'o elemento raiz precisa ser <svg>'],
    ['sem raiz', '   ', 'o elemento raiz precisa ser <svg>'],
  ];
  it.each(casos)(
    'Dado %s, Quando sanitiza, Então a mensagem explica',
    (_n, fonte, mensagem) => {
      rejectsWith(
        fonte,
        `SVG não aceito: ${mensagem}`.replace(
          'SVG não aceito: DOCTYPE',
          'SVG não aceito: DOCTYPE',
        ),
      );
    },
  );
});

describe('Feature: limites numéricos do sanitizador (#427)', () => {
  const aninhado = (profundidade: number) =>
    `<svg ${NS}>${'<g>'.repeat(profundidade)}${'</g>'.repeat(profundidade)}</svg>`;

  it('Dado aninhamento exatamente no limite, Quando sanitiza, Então aceita', () => {
    expect(() => sanitizeSvg(aninhado(MAX_SVG_DEPTH))).not.toThrow();
  });

  it('Dado aninhamento um acima do limite, Quando sanitiza, Então rejeita', () => {
    rejectsWith(aninhado(MAX_SVG_DEPTH + 1), 'aninhamento profundo demais');
  });

  it('Dado elementos exatamente no limite, Quando sanitiza, Então aceita', () => {
    const fonte = svg('<g/>'.repeat(MAX_SVG_ELEMENTS - 1));
    expect(() => sanitizeSvg(fonte)).not.toThrow();
  });

  it('Dado um elemento acima do limite, Quando sanitiza, Então rejeita', () => {
    rejectsWith(svg('<g/>'.repeat(MAX_SVG_ELEMENTS)), 'elementos demais');
  });

  it('Dado a maior referência Unicode, Quando sanitiza, Então aceita', () => {
    expect(() => sanitizeSvg(svg('<title>&#x10FFFF;</title>'))).not.toThrow();
    expect(() => sanitizeSvg(svg('<title>&#1114111;</title>'))).not.toThrow();
  });

  it('Dado a primeira referência acima de Unicode, Quando sanitiza, Então rejeita', () => {
    rejectsWith(
      svg('<title>&#1114112;</title>'),
      'referência numérica inválida',
    );
  });

  it('Dado a menor referência válida, Quando sanitiza, Então aceita', () => {
    expect(sanitizeSvg(svg('<title>&#65;</title>'))).toContain('>A<');
    expect(sanitizeSvg(svg('<title>&#x41;</title>'))).toContain('>A<');
  });
});

describe('Feature: controle e espaço não escondem conteúdo ativo (#427)', () => {
  it.each([
    ['espaço (0x20)', 'java script:x'],
    ['tab', 'java\tscript:x'],
    ['DEL (0x7f)', 'java\u007fscript:x'],
    ['C1 baixo (0x80)', 'java\u0080script:x'],
    ['C1 alto (0x9f)', 'java\u009fscript:x'],
    ['controle 0x01', 'java\u0001script:x'],
  ])(
    'Dado %s no meio de javascript:, Quando sanitiza, Então rejeita',
    (_n, valor) => {
      rejectsWith(svg('', `fill="${valor}"`), 'conteúdo ativo em um valor');
    },
  );

  it('Dado valor com caractere acima de 0x9f (nbsp), Quando sanitiza, Então não vira falso positivo', () => {
    expect(() => sanitizeSvg(svg('', 'fill="a b"'))).not.toThrow();
  });

  it('Dado texto com "javascript" sem dois-pontos, Quando sanitiza, Então aceita', () => {
    expect(() => sanitizeSvg(svg('', 'fill="javascript"'))).not.toThrow();
  });
});

describe('Feature: referências por fragmento (#427)', () => {
  it.each(['#a', '#_a', '#a.b', '#a:b', '#a-b', '#a1'])(
    'Dado href %s, Quando sanitiza, Então aceita',
    (ref) => {
      expect(sanitizeSvg(svg(`<use href="${ref}"/>`))).toContain(
        `href="${ref}"`,
      );
    },
  );

  it.each(['#', '#1a', '#-a', 'a', '##a', '#a b', '#a#b', 'x#a', '#a/b'])(
    'Dado href %j, Quando sanitiza, Então rejeita',
    (ref) => {
      rejectsWith(svg(`<use href="${ref}"/>`), 'link externo em href');
    },
  );

  it('Dado href com espaços ao redor, Quando sanitiza, Então grava aparado', () => {
    expect(sanitizeSvg(svg('<use xlink:href="  #a  "/>'))).toContain(
      'xlink:href="#a"',
    );
  });

  it.each(['url(#a)', 'url( #a )', "url('#a')", 'url("#a")', 'url(#a.b)'])(
    'Dado fill %s, Quando sanitiza, Então aceita',
    (valor) => {
      expect(() =>
        sanitizeSvg(svg('', `fill="${valor.replace(/"/g, '&quot;')}"`)),
      ).not.toThrow();
    },
  );

  it.each([
    'url()',
    'url(#)',
    'url(#1)',
    'url(\'#a")',
    'url("#a)',
    'url(a)',
    'url(##a)',
    'url(#a b)',
    'url(x#a)',
  ])('Dado fill %s, Quando sanitiza, Então rejeita', (valor) => {
    expect(() =>
      sanitizeSvg(svg('', `fill="${valor.replace(/"/g, '&quot;')}"`)),
    ).toThrow(ValidationError);
  });

  it('Dado vários url() no mesmo valor com um externo, Quando sanitiza, Então rejeita', () => {
    rejectsWith(
      svg('', 'fill="url(#a) url(http://x.test/a)"'),
      'referência externa em url()',
    );
  });

  it('Dado fill com url("#a") contendo espaço antes de ), Quando sanitiza, Então aceita', () => {
    expect(() => sanitizeSvg(svg('', 'fill="url(#a )"'))).not.toThrow();
  });
});

describe('Feature: xmlns é reconstruído, não copiado (#427)', () => {
  it('Dado xmlns de outro namespace, Quando sanitiza, Então o svg sai com o namespace correto', () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://evil.test/ns" xmlns:xlink="http://evil.test/x"><g/></svg>',
    );
    expect(out.startsWith(`<svg ${NS} ${XL}>`)).toBe(true);
    expect(out).not.toContain('evil.test');
  });

  it('Dado xmlns corretos no svg, Quando sanitiza, Então aparecem uma única vez', () => {
    const out = sanitizeSvg(`<svg ${NS} ${XL}/>`);
    expect(out).toBe(`<svg ${NS} ${XL}/>`);
  });

  it('Dado xmlns em elemento filho, Quando sanitiza, Então não é repetido', () => {
    const out = sanitizeSvg(svg(`<g ${NS} ${XL}/>`));
    expect(out).toContain('<g/>');
  });

  it('Dado atributo desconhecido, Quando sanitiza, Então é descartado em silêncio', () => {
    expect(sanitizeSvg(svg('<g data-x="1" sodipodi:foo="2"/>'))).toContain(
      '<g/>',
    );
  });
});

describe('Feature: estrutura do XML em posições variadas (#427)', () => {
  it('Dado espaços ao redor do =, Quando sanitiza, Então lê o atributo', () => {
    expect(sanitizeSvg(svg('<g  fill  =  "red"  />'))).toContain('fill="red"');
  });

  it('Dado espaço antes do > de fechamento, Quando sanitiza, Então aceita', () => {
    expect(sanitizeSvg(svg('<g></g >'))).toContain('<g/>');
  });

  it('Dado aspas simples, Quando sanitiza, Então lê o valor', () => {
    expect(sanitizeSvg(svg("<g fill='red'/>"))).toContain('fill="red"');
  });

  it('Dado aspas dentro de aspas diferentes, Quando sanitiza, Então preserva e escapa na saída', () => {
    expect(sanitizeSvg(svg(`<g fill='a"b'/>`))).toContain('fill="a&quot;b"');
  });

  it('Dado comentário, PI e CDATA em posições variadas, Quando sanitiza, Então descarta ou preserva o texto', () => {
    const out = sanitizeSvg(
      `<?xml version="1.0"?><!-- a --><!DOCTYPE svg><svg ${NS}><!-- b --><?pi x?><title><![CDATA[a<b]]></title><g/></svg>`,
    );
    expect(out).toContain('<title>a&lt;b</title>');
    expect(out).toContain('<g/>');
    expect(out).not.toContain('<!--');
    expect(out).not.toContain('<?');
  });

  it('Dado BOM no começo, Quando sanitiza, Então ignora', () => {
    expect(sanitizeSvg(`﻿${svg('<g/>')}`)).toContain('<g/>');
  });

  it('Dado texto solto em elemento que não é de texto, Quando sanitiza, Então é descartado', () => {
    expect(sanitizeSvg(svg('<g>solto</g>'))).toContain('<g/>');
  });

  it('Dado texto em <text>, Quando sanitiza, Então é preservado com escape', () => {
    expect(sanitizeSvg(svg('<text>a &amp; b</text>'))).toContain(
      '<text>a &amp; b</text>',
    );
  });

  it('Dado texto até o fim do arquivo, Quando sanitiza, Então rejeita por falta de fechamento', () => {
    rejectsWith(`<svg ${NS}><title>abc`, 'elemento sem fechamento');
  });

  it('Dado elemento vazio com filhos vazios, Quando sanitiza, Então fecha em linha', () => {
    expect(sanitizeSvg(svg('<g></g>'))).toBe(`<svg ${NS} ${XL}><g/></svg>`);
  });

  it('Dado o svg raiz com BOM, atributos e filhos, Quando sanitiza, Então escapa aspas e <> na saída', () => {
    const out = sanitizeSvg(svg('<text>1 &lt; 2 &gt; 0</text>'));
    expect(out).toContain('<text>1 &lt; 2 &gt; 0</text>');
  });
});

describe('Feature: <style> e style="" (#427)', () => {
  it('Dado <style> simples, Quando sanitiza, Então mantém e remove comentários CSS', () => {
    const out = sanitizeSvg(svg('<style>/* c */ .a { fill: red }</style>'));
    expect(out).toContain('<style>.a { fill: red }</style>');
  });

  it('Dado style="" com declaração sem dois-pontos, Quando sanitiza, Então ignora a declaração', () => {
    expect(sanitizeSvg(svg('<g style="sem-dois-pontos;fill:red"/>'))).toContain(
      'style="fill:red"',
    );
  });

  it('Dado style="" com espaços e maiúsculas, Quando sanitiza, Então normaliza a propriedade', () => {
    expect(sanitizeSvg(svg('<g style="  FILL :  red  "/>'))).toContain(
      'style="fill:red"',
    );
  });

  it('Dado style="" com valor vazio, Quando sanitiza, Então descarta a declaração', () => {
    expect(sanitizeSvg(svg('<g style="fill:;stroke:red"/>'))).toContain(
      'style="stroke:red"',
    );
  });

  it('Dado style="" com propriedade desconhecida, Quando sanitiza, Então descarta', () => {
    expect(sanitizeSvg(svg('<g style="foo:bar;fill:red"/>'))).toContain(
      'style="fill:red"',
    );
  });

  it('Dado style="" com duas declarações, Quando sanitiza, Então junta com ponto e vírgula', () => {
    expect(sanitizeSvg(svg('<g style="fill:red;stroke:blue"/>'))).toContain(
      'style="fill:red;stroke:blue"',
    );
  });

  it('Dado style="" com url externo, Quando sanitiza, Então rejeita', () => {
    rejectsWith(
      svg('<g style="fill:url(http://x.test/a)"/>'),
      'referência externa em url()',
    );
  });

  it.each([
    'expression(x)',
    'behavior:x',
    '-moz-binding:x',
    '@import',
    'image-set(x)',
    'cross-fade(x)',
    'element(x)',
    'paint(x)',
    'a\\62 c',
    'vbscript:x',
    'data:x',
  ])('Dado valor %j, Quando sanitiza, Então rejeita', (valor) => {
    rejectsWith(svg('', `fill="${valor}"`), 'conteúdo ativo em um valor');
  });
});
