import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  idsDeRegras,
  problemasDeRastreabilidade,
} from '../support/rastreabilidade-bdd';
import { REGRAS_CRITICAS } from './regras-criticas';

const RAIZ = process.cwd();

function lerArquivo(caminho: string): string | null {
  const completo = join(RAIZ, caminho);
  return existsSync(completo) ? readFileSync(completo, 'utf8') : null;
}

function readmesDosDominios(): string[] {
  const base = join(RAIZ, 'docs/domains');
  return readdirSync(base, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) =>
      readFileSync(join(base, entrada.name, 'README.md'), 'utf8'),
    );
}

describe('Feature: Rastreabilidade das regras críticas (ADR-048)', () => {
  describe('Cenário: o repositório real', () => {
    it('Dadas as regras críticas, Quando cruzar com a documentação e os testes, Então todas têm cenário Dado/Quando/Então existente', () => {
      const problemas = problemasDeRastreabilidade(
        REGRAS_CRITICAS,
        idsDeRegras(readmesDosDominios()),
        lerArquivo,
      );

      expect(problemas).toEqual([]);
    });

    it('Dados os domínios documentados, Quando listar as regras críticas, Então há ao menos uma por domínio de risco', () => {
      const prefixos = new Set(
        Object.keys(REGRAS_CRITICAS).map((id) => id.split('-')[0]),
      );

      for (const dominio of ['ACE', 'AGE', 'EST', 'FIN', 'PRO', 'POR']) {
        expect(prefixos.has(dominio)).toBe(true);
      }
    });
  });

  describe('Cenário: o teste de estrutura realmente falha', () => {
    const doc = [
      '| ACE-RN-05 | regra | onde |',
      '| FIN-RN-01 | regra | onde |',
    ];
    const ids = idsDeRegras([doc.join('\n')]);

    it('Dada regra crítica sem cenário, Quando verificar, Então aponta a regra', () => {
      const problemas = problemasDeRastreabilidade(
        { 'ACE-RN-05': [] },
        ids,
        () => '',
      );

      expect(problemas).toEqual([
        'ACE-RN-05: regra crítica sem cenário ligado',
      ]);
    });

    it('Dada regra que não existe na documentação, Quando verificar, Então aponta a regra', () => {
      const problemas = problemasDeRastreabilidade(
        { 'XXX-RN-99': [{ arquivo: 'a.test.ts', titulo: 'Dado x' }] },
        ids,
        () => 'Dado x',
      );

      expect(problemas).toContain(
        'XXX-RN-99: regra não existe nas tabelas de docs/domains',
      );
    });

    it('Dado cenário cujo título sumiu do arquivo, Quando verificar, Então aponta o título', () => {
      const problemas = problemasDeRastreabilidade(
        { 'FIN-RN-01': [{ arquivo: 'a.test.ts', titulo: 'Dado pago' }] },
        ids,
        () => 'it("outro nome")',
      );

      expect(problemas).toEqual([
        'FIN-RN-01: cenário "Dado pago" não está em a.test.ts',
      ]);
    });

    it('Dado arquivo de teste inexistente, Quando verificar, Então aponta o arquivo', () => {
      const problemas = problemasDeRastreabilidade(
        { 'FIN-RN-01': [{ arquivo: 'sumiu.test.ts', titulo: 'Dado pago' }] },
        ids,
        () => null,
      );

      expect(problemas).toEqual([
        'FIN-RN-01: arquivo sumiu.test.ts não existe',
      ]);
    });

    it('Dado título fora do formato de negócio, Quando verificar, Então aponta o formato', () => {
      const problemas = problemasDeRastreabilidade(
        { 'FIN-RN-01': [{ arquivo: 'a.test.ts', titulo: 'funciona' }] },
        ids,
        () => 'funciona',
      );

      expect(problemas).toEqual([
        'FIN-RN-01: "funciona" não está no formato Dado/Quando/Então',
      ]);
    });
  });
});
