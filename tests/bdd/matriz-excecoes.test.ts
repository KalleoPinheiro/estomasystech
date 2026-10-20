import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS_DE_EXCECAO,
  linhasDaMatriz,
  problemasDaMatriz,
  testesCitados,
} from '../support/matriz-excecoes';
import { idsDeRegras } from '../support/rastreabilidade-bdd';

const RAIZ = process.cwd();
const DOMINIOS = join(RAIZ, 'docs/domains');

function lerArquivo(caminho: string): string | null {
  const completo = join(RAIZ, caminho);
  return existsSync(completo) ? readFileSync(completo, 'utf8') : null;
}

const dominios = readdirSync(DOMINIOS, { withFileTypes: true })
  .filter((entrada) => entrada.isDirectory())
  .map((entrada) => entrada.name);

const idsDocumentados = idsDeRegras(
  dominios.map((d) => readFileSync(join(DOMINIOS, d, 'README.md'), 'utf8')),
);

describe('Feature: Matriz de casos de exceção por domínio (ADR-049)', () => {
  describe('Cenário: a documentação real', () => {
    it.each(dominios)(
      'Dado o domínio %s, Quando cruzar a matriz com os testes, Então toda categoria tem linha e todo teste citado existe',
      (dominio) => {
        const markdown = lerArquivo(`docs/domains/${dominio}/excecoes.md`);

        expect(markdown, `docs/domains/${dominio}/excecoes.md`).not.toBeNull();
        expect(
          problemasDaMatriz(
            dominio,
            markdown ?? '',
            idsDocumentados,
            lerArquivo,
          ),
        ).toEqual([]);
      },
    );
  });

  describe('Cenário: o teste de estrutura realmente falha', () => {
    const ids = ['FIN-RN-01'];
    const cabecalho =
      '| Categoria | Caso | Regra | Teste |\n| --- | --- | --- | --- |';
    const todasAsCategorias = CATEGORIAS_DE_EXCECAO.map(
      (categoria) =>
        `| ${categoria} | caso | — | n/a — não se aplica a este domínio |`,
    ).join('\n');
    const base = `${cabecalho}\n${todasAsCategorias}`;

    it('Dada matriz completa só com n/a justificado, Quando verificar, Então não há problema', () => {
      expect(problemasDaMatriz('fin', base, ids, () => null)).toEqual([]);
    });

    it('Dada categoria sem linha, Quando verificar, Então aponta a categoria', () => {
      const semConcorrencia = base
        .split('\n')
        .filter((linha) => !linha.startsWith('| concorrência'))
        .join('\n');

      expect(
        problemasDaMatriz('fin', semConcorrencia, ids, () => null),
      ).toEqual(['fin: categoria "concorrência" sem linha']);
    });

    it('Dado teste citado que não existe no arquivo, Quando verificar, Então aponta o título', () => {
      const tabela = `${base}\n| duplicidade | pagar duas vezes | FIN-RN-01 | \`a.test.ts\` › "Dado pago" |`;

      expect(
        problemasDaMatriz('fin', tabela, ids, () => 'it("outro")'),
      ).toEqual(['fin:10: teste "Dado pago" não está em a.test.ts']);
    });

    it('Dado arquivo de teste inexistente, Quando verificar, Então aponta o arquivo', () => {
      const tabela = `${base}\n| duplicidade | pagar duas vezes | — | \`a.test.ts\` › "Dado pago" |`;

      expect(problemasDaMatriz('fin', tabela, ids, () => null)).toEqual([
        'fin:10: arquivo a.test.ts não existe',
      ]);
    });

    it('Dado teste que existe, Quando verificar, Então a linha passa', () => {
      const tabela = `${base}\n| duplicidade | pagar duas vezes | FIN-RN-01 | \`a.test.ts\` › "Dado pago" |`;

      expect(
        problemasDaMatriz('fin', tabela, ids, () => 'it("Dado pago, Quando")'),
      ).toEqual([]);
    });

    it('Dada linha sem teste e sem n/a, Quando verificar, Então aponta a linha', () => {
      const tabela = `${base}\n| duplicidade | pagar duas vezes | — | testado manualmente |`;

      expect(problemasDaMatriz('fin', tabela, ids, () => null)).toEqual([
        'fin:10: não cita teste nem n/a com motivo',
      ]);
    });

    it('Dado n/a sem motivo, Quando verificar, Então aponta a linha', () => {
      const tabela = `${base}\n| duplicidade | pagar duas vezes | — | n/a |`;

      expect(problemasDaMatriz('fin', tabela, ids, () => null)).toEqual([
        'fin:10: n/a sem motivo',
      ]);
    });

    it('Dada regra inexistente na documentação, Quando verificar, Então aponta a regra', () => {
      const tabela = `${base}\n| duplicidade | pagar duas vezes | FIN-RN-99 | n/a — sem pagamento duplo neste fluxo |`;

      expect(problemasDaMatriz('fin', tabela, ids, () => null)).toEqual([
        'fin:10: regra FIN-RN-99 não existe nas tabelas de docs/domains',
      ]);
    });

    it('Dada categoria fora da lista e caso vazio, Quando verificar, Então aponta as duas', () => {
      const tabela = `${base}\n| inventada |  | — | n/a — categoria fora da lista |`;

      expect(problemasDaMatriz('fin', tabela, ids, () => null)).toEqual([
        'fin:10: categoria desconhecida "inventada"',
        'fin:10: caso vazio',
      ]);
    });

    it('Dado texto fora de tabela de matriz, Quando ler as linhas, Então só as linhas da matriz entram', () => {
      const texto = `intro\n\n| Outra | tabela |\n| --- | --- |\n| x | y |\n\n${base}\n\nfim`;

      expect(linhasDaMatriz(texto)).toHaveLength(CATEGORIAS_DE_EXCECAO.length);
    });

    it('Dada célula com várias citações, Quando extrair, Então devolve todas', () => {
      const celula = '`a.test.ts` › "Dado um" ; `e2e/b.spec.ts` › "Dado dois"';

      expect(testesCitados(celula)).toEqual([
        { arquivo: 'a.test.ts', titulo: 'Dado um' },
        { arquivo: 'e2e/b.spec.ts', titulo: 'Dado dois' },
      ]);
    });
  });
});
