import { describe, expect, it } from 'vitest';
import {
  MAX_SVG_DEPTH,
  MAX_SVG_ELEMENTS,
  sanitizeSvg,
} from '@/domain/clinic/svg-sanitizer';
import { ValidationError } from '@/domain/shared/errors';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const svg = (inner: string, attrs = '') => `<svg ${NS} ${attrs}>${inner}</svg>`;

const rejects = (source: string) =>
  expect(() => sanitizeSvg(source)).toThrow(ValidationError);

describe('Feature: SVG de logo e avatar é sanitizado no envio (#427)', () => {
  describe('Cenário: payloads de XSS conhecidos são rejeitados', () => {
    const payloads: [string, string][] = [
      ['script', svg('<script>alert(1)</script>')],
      ['script com namespace trocado', svg('<script xlink:href="x.js"/>')],
      ['onload no svg', svg('', 'onload="alert(1)"')],
      ['onclick em maiúsculas', svg('<rect OnClick="alert(1)"/>')],
      ['onerror num filho', svg('<rect onerror="alert(1)" width="1"/>')],
      [
        'foreignObject com iframe',
        svg(
          '<foreignObject><iframe src="javascript:alert(1)"/></foreignObject>',
        ),
      ],
      ['iframe solto', svg('<iframe src="https://evil.test"/>')],
      ['object', svg('<object data="https://evil.test/x.swf"/>')],
      ['embed', svg('<embed src="https://evil.test/x"/>')],
      ['image externa', svg('<image href="https://evil.test/track.png"/>')],
      [
        'image com data URI',
        svg('<image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="/>'),
      ],
      [
        'animate trocando href para javascript:',
        svg(
          '<a><animate attributeName="href" values="javascript:alert(1)"/></a>',
        ),
      ],
      [
        'set de href',
        svg('<set attributeName="href" to="javascript:alert(1)"/>'),
      ],
      ['use com href externo', svg('<use href="https://evil.test/x.svg#a"/>')],
      [
        'use com xlink:href externo',
        svg('<use xlink:href="//evil.test/x.svg#a"/>'),
      ],
      ['use com data URI', svg('<use href="data:image/svg+xml,<svg/>"/>')],
      ['use com javascript:', svg('<use href="javascript:alert(1)"/>')],
      [
        'javascript: com tab no meio',
        svg('<rect fill="java&#9;script:alert(1)"/>'),
      ],
      [
        'javascript: por referência numérica',
        svg('<rect fill="&#106;avascript:alert(1)"/>'),
      ],
      [
        'javascript: por referência hexadecimal',
        svg('<rect fill="&#x6A;avascript:alert(1)"/>'),
      ],
      ['vbscript:', svg('<rect fill="vbscript:msgbox(1)"/>')],
      [
        'style com url externa',
        svg('<rect style="fill:url(https://evil.test/x)"/>'),
      ],
      [
        'style com expression()',
        svg('<rect style="width:expression(alert(1))"/>'),
      ],
      ['style com behavior', svg('<rect style="behavior:url(x.htc)"/>')],
      [
        'style com -moz-binding',
        svg('<rect style="-moz-binding:url(x.xml#a)"/>'),
      ],
      ['fill com url externa', svg('<rect fill="url(https://evil.test/x)"/>')],
      [
        '<style> com @import',
        svg('<style>@import url(https://evil.test/x.css);</style>'),
      ],
      [
        '<style> com @font-face',
        svg('<style>@font-face{src:url(x.woff)}</style>'),
      ],
      [
        '<style> com url externa',
        svg('<style>rect{fill:url(https://evil.test/x)}</style>'),
      ],
      [
        '<style> com escape CSS',
        svg('<style>rect{background:\\75rl(x)}</style>'),
      ],
      [
        '<style> com image-set de URL externa',
        svg(
          '<style>rect{fill:image-set("https://evil.test/x.png" 1x)}</style>',
        ),
      ],
      ['"<" que entra por entidade em atributo', svg('<rect fill="a&lt;b"/>')],
      [
        'evento escondido em elemento que seria descartado',
        svg('<a onclick="alert(1)"><rect/></a>'),
      ],
      [
        'script escondido em elemento que seria descartado',
        svg('<a>texto<g><script>alert(1)</script></g></a>'),
      ],
      [
        'javascript: com caractere de controle C1 no meio',
        svg('<rect fill="java&#x85;script:alert(1)"/>'),
      ],
      [
        'javascript: com DEL no meio',
        svg('<rect fill="java&#x7f;script:alert(1)"/>'),
      ],
      ['DOCTYPE com entidade', `<!DOCTYPE svg [<!ENTITY x "y">]>${svg('')}`],
      [
        'bomba de entidades',
        `<!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]>${svg('<text>&b;</text>')}`,
      ],
      ['entidade nomeada desconhecida', svg('<text>&nbsp;</text>')],
      ['referência numérica inválida', svg('<text>&#0;</text>')],
      ['referência numérica acima do Unicode', svg('<text>&#x110000;</text>')],
      ['"<" dentro de atributo', svg('<rect fill="a<b"/>')],
      [
        'CDATA com tag no valor de atributo',
        svg('<rect fill="<![CDATA[x]]>"/>'),
      ],
    ];

    it.each(payloads)(
      'Dado %s, Quando sanitizar, Então rejeita o arquivo',
      (_nome, source) => {
        rejects(source);
      },
    );
  });

  describe('Cenário: XML malformado ou fora do formato', () => {
    const malformed: [string, string][] = [
      ['raiz que não é svg', '<html><body/></html>'],
      ['vazio', ''],
      ['texto solto fora da raiz', `hello${svg('')}`],
      ['duas raízes', `${svg('')}${svg('')}`],
      ['elemento sem fechamento', `<svg ${NS}><g>`],
      ['fechamento trocado', `<svg ${NS}><g></path></svg>`],
      ['atributo sem valor', `<svg ${NS} hidden>`],
      ['atributo sem aspas', `<svg ${NS} width=10></svg>`],
      ['atributo repetido', `<svg ${NS} width="1" width="2"></svg>`],
      ['comentário aberto', `<svg ${NS}><!-- x</svg>`],
      ['CDATA aberto', `<svg ${NS}><style><![CDATA[ x</style></svg>`],
      ['instrução aberta', `<svg ${NS}><? x </svg>`],
      ['declaração desconhecida', `<!ELEMENT a b>${svg('')}`],
      ['nome de tag inválido', `<svg ${NS}><1/></svg>`],
      ['arquivo que acaba dentro da tag', `<svg ${NS} `],
      ['texto até o fim sem fechar', `<svg ${NS}>texto`],
      ['fechamento sem ">"', `<svg ${NS}></svg`],
      ['valor de atributo sem fechar', `<svg ${NS} width="1></svg>`],
    ];

    it.each(malformed)(
      'Dado %s, Quando sanitizar, Então rejeita com erro claro',
      (_nome, source) => {
        rejects(source);
      },
    );

    it('Dado aninhamento acima do limite, Quando sanitizar, Então rejeita', () => {
      const deep =
        '<g>'.repeat(MAX_SVG_DEPTH + 1) + '</g>'.repeat(MAX_SVG_DEPTH + 1);
      rejects(svg(deep));
    });

    it('Dado elementos demais, Quando sanitizar, Então rejeita', () => {
      rejects(svg('<rect/>'.repeat(MAX_SVG_ELEMENTS + 1)));
    });

    it('Dado a rejeição, Então a mensagem diz que o SVG não foi aceito e por quê', () => {
      expect(() => sanitizeSvg(svg('<script>alert(1)</script>'))).toThrow(
        /SVG não aceito: elemento <script> não é permitido/,
      );
    });
  });

  describe('Cenário: sobra de editor gráfico é descartada em silêncio', () => {
    const illustrator = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: editor -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 100 100" inkscape:version="1.3">
  <metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata>
  <sodipodi:namedview id="base" pagecolor="#ffffff"/>
  <title>Clínica</title>
  <defs><linearGradient id="g"><stop offset="0" stop-color="#0a0"/></linearGradient></defs>
  <style><![CDATA[ .st0{fill:url(#g);stroke:#fff} ]]></style>
  <g inkscape:label="camada">
    <path class="st0" d="M10 10h80v80H10z" inkscape:connector-curvature="0"/>
    <use href="#g"/>
    <text x="1" y="2">A &amp; B</text>
  </g>
</svg>`;

    it('Dado um SVG de editor, Quando sanitizar, Então mantém o desenho e remove metadado e atributos do editor', () => {
      const clean = sanitizeSvg(illustrator);

      expect(clean).toContain('<path class="st0" d="M10 10h80v80H10z"/>');
      expect(clean).toContain('viewBox="0 0 100 100"');
      expect(clean).toContain('<linearGradient id="g">');
      expect(clean).toContain('<use href="#g"/>');
      expect(clean).toContain('<title>Clínica</title>');
      expect(clean).toContain('A &amp; B');
      expect(clean).toContain('.st0{fill:url(#g);stroke:#fff}');
      for (const gone of [
        'metadata',
        'sodipodi',
        'inkscape',
        'DOCTYPE',
        '<?xml',
        '<!--',
        'rdf',
      ]) {
        expect(clean).not.toContain(gone);
      }
    });

    it('Dado um SVG sem xmlns, Quando sanitizar, Então a raiz sai com o namespace do SVG', () => {
      expect(
        sanitizeSvg(
          '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
        ),
      ).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
    });

    it('Dado xmlns:xlink de outro endereço, Quando sanitizar, Então ele é descartado e o do XLink é reposto', () => {
      const clean = sanitizeSvg(
        '<svg xmlns:xlink="http://evil.test/x"><rect/></svg>',
      );

      expect(clean).not.toContain('evil.test');
      expect(clean).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    });

    it('Dado um xmlns de outro endereço, Quando sanitizar, Então ele é trocado pelo do SVG', () => {
      const clean = sanitizeSvg(
        '<svg xmlns="http://evil.test/ns"><rect/></svg>',
      );

      expect(clean).not.toContain('evil.test');
      expect(clean).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('Dado elemento fora da lista e inofensivo (<a>), Quando sanitizar, Então ele e o que contém somem', () => {
      const clean = sanitizeSvg(
        svg('<a href="https://x.test"><rect id="dentro"/></a><circle r="1"/>'),
      );

      expect(clean).not.toContain('dentro');
      expect(clean).not.toContain('<a');
      expect(clean).toContain('<circle r="1"/>');
    });

    it('Dado atributo fora da lista (data-*, aria-*), Quando sanitizar, Então ele é descartado', () => {
      const clean = sanitizeSvg(
        svg('<rect data-x="1" aria-label="a" width="3"/>'),
      );

      expect(clean).toContain('<rect width="3"/>');
    });

    it('Dado style com propriedade fora da lista e declaração sem valor, Quando sanitizar, Então só as permitidas ficam', () => {
      const clean = sanitizeSvg(
        svg('<rect style="fill:red;cursor:pointer;;novalor;stroke:"/>'),
      );

      expect(clean).toContain('style="fill:red"');
    });

    it('Dado style só com propriedades proibidas, Quando sanitizar, Então o atributo sai vazio', () => {
      expect(sanitizeSvg(svg('<rect style="cursor:pointer"/>'))).toContain(
        'style=""',
      );
    });

    it('Dado texto em elemento que não é de texto, Quando sanitizar, Então o texto some', () => {
      expect(sanitizeSvg(svg('<g>solto<rect/></g>'))).not.toContain('solto');
    });

    it('Dado comentário dentro de elemento e CSS com comentário, Quando sanitizar, Então ambos somem', () => {
      const clean = sanitizeSvg(
        svg('<g><!-- c --><style>/* x */ rect{fill:red}</style></g>'),
      );

      expect(clean).not.toContain('<!--');
      expect(clean).toContain('<style>rect{fill:red}</style>');
    });

    it('Dado href interno com espaços em volta, Quando sanitizar, Então o valor é aparado', () => {
      expect(sanitizeSvg(svg('<use xlink:href=" #a "/>'))).toContain(
        'xlink:href="#a"',
      );
    });

    it('Dado BOM e espaços antes do <svg>, Quando sanitizar, Então aceita', () => {
      expect(() => sanitizeSvg(`﻿  \n${svg('<rect/>')}\n`)).not.toThrow();
    });

    it('Dado aspas simples e valor com aspas, Quando sanitizar, Então o valor é reescapado na saída', () => {
      const clean = sanitizeSvg(svg("<text font-family='a\"b'>x</text>"));

      expect(clean).toContain('font-family="a&quot;b"');
    });

    it('Dado texto com < e > escapados, Quando sanitizar, Então a saída reescapa', () => {
      expect(sanitizeSvg(svg('<text>1 &lt; 2 &gt; 0</text>'))).toContain(
        '1 &lt; 2 &gt; 0',
      );
    });
  });

  describe('Cenário: a saída nunca carrega o que foi barrado', () => {
    it('Dado SVG válido, Quando sanitizar duas vezes, Então a segunda não muda nada (idempotente)', () => {
      const once = sanitizeSvg(
        svg('<g fill="red"><circle cx="1" cy="1" r="1"/></g>'),
      );

      expect(sanitizeSvg(once)).toBe(once);
    });
  });
});
