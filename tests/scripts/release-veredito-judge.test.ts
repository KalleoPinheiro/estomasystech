import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  avaliarVeredito,
  escolherVeredito,
  extrairVeredito,
  formatarAvaliacao,
  lerVeredito,
  SCHEMA_VEREDITO,
} from '../../scripts/release/veredito-judge-lib';

const SHA = 'a'.repeat(40);
const OUTRO = 'b'.repeat(40);
const veredito = (extra: Record<string, unknown> = {}) => ({
  schema: SCHEMA_VEREDITO,
  sha: SHA,
  autor: 'thread-autora',
  revisor: 'thread-revisora',
  achados: [] as unknown[],
  ...extra,
});
const alvo = { sha: SHA, autor: 'thread-autora' };
const bloqueante = {
  severidade: 'bloqueante',
  titulo: 'Vaza dado entre clínicas',
  arquivo: 'src/a.ts',
  linha: 12,
};

describe('veredito do the-judge · leitura', () => {
  it('Dado um veredito completo, Quando lê, Então devolve o objeto tipado', () => {
    const achados = [
      bloqueante,
      { severidade: 'sugestao', titulo: 'Renomear', detalhe: 'x' },
    ];
    const lido = lerVeredito(veredito({ achados, resumo: 'ok' }));
    expect(lido).toEqual({
      ok: true,
      veredito: expect.objectContaining({
        resumo: 'ok',
        achados: [
          expect.objectContaining({ linha: 12 }),
          expect.objectContaining({ detalhe: 'x' }),
        ],
      }),
    });
  });

  it.each([
    ['não é objeto', 'texto', 'não é um objeto'],
    ['é lista', [], 'não é um objeto'],
    ['é null', null, 'não é um objeto'],
    ['schema errado', veredito({ schema: 'the-judge/v0' }), 'schema'],
    ['sha curto', veredito({ sha: 'abc1234' }), 'sha'],
    ['sha ausente', veredito({ sha: undefined }), 'sha'],
    ['sha em maiúscula', veredito({ sha: 'A'.repeat(40) }), 'sha'],
    ['autor vazio', veredito({ autor: ' ' }), 'autor'],
    ['revisor ausente', veredito({ revisor: undefined }), 'revisor'],
    [
      'achados não é lista',
      veredito({ achados: {} }),
      'achados deve ser uma lista',
    ],
    [
      'achado não é objeto',
      veredito({ achados: ['x'] }),
      'achados[0] não é um objeto',
    ],
    [
      'severidade inválida',
      veredito({ achados: [{ severidade: 'grave', titulo: 't' }] }),
      'severidade inválida',
    ],
    [
      'achado sem título',
      veredito({ achados: [{ severidade: 'importante' }] }),
      'titulo ausente',
    ],
  ])(
    'Dado veredito que %s, Quando lê, Então rejeita com motivo',
    (_nome, bruto, trecho) => {
      const lido = lerVeredito(bruto);
      expect(lido.ok).toBe(false);
      expect(lido.ok === false && lido.erro).toContain(trecho);
    },
  );

  it('Dado achado com campos opcionais de tipo errado, Quando lê, Então ignora os opcionais', () => {
    const lido = lerVeredito(
      veredito({
        achados: [
          {
            severidade: 'importante',
            titulo: 't',
            arquivo: 1,
            linha: 'x',
            detalhe: 2,
          },
        ],
        resumo: 3,
      }),
    );
    expect(lido).toEqual({
      ok: true,
      veredito: expect.objectContaining({
        achados: [{ severidade: 'importante', titulo: 't' }],
      }),
    });
    expect(lido.ok && 'resumo' in lido.veredito).toBe(false);
  });
});

describe('veredito do the-judge · extração do comentário', () => {
  const json = JSON.stringify(veredito());

  it('Dado JSON puro, Quando extrai, Então devolve o objeto', () => {
    expect(extrairVeredito(`  ${json}\n`)).toEqual(veredito());
  });

  it('Dado comentário com prosa e bloco ```json the-judge```, Quando extrai, Então devolve o último bloco', () => {
    const velho = JSON.stringify(veredito({ sha: OUTRO }));
    const texto = `Revisão:\n\`\`\`json the-judge\n${velho}\n\`\`\`\nAtualizado:\n\`\`\`json the-judge\n${json}\n\`\`\`\n`;
    expect(extrairVeredito(texto)).toEqual(veredito());
    expect(extrairVeredito(`\`\`\`the-judge-json\n${json}\n\`\`\``)).toEqual(
      veredito(),
    );
  });

  it('Dado comentário sem veredito, Quando extrai, Então devolve undefined; JSON quebrado devolve null', () => {
    expect(extrairVeredito('LGTM!')).toBeUndefined();
    expect(extrairVeredito('```json\n{"a":1}\n```')).toBeUndefined();
    expect(extrairVeredito('{ quebrado')).toBeNull();
    expect(extrairVeredito('```json the-judge\n{ quebrado\n```')).toBeNull();
  });

  it('Dado vários comentários, Quando escolhe, Então vale o último que traz veredito', () => {
    const antigo = JSON.stringify(veredito({ sha: OUTRO }));
    expect(escolherVeredito([antigo, 'conversa', json, 'obrigado'])).toEqual(
      veredito(),
    );
    expect(escolherVeredito(['só conversa'])).toBeUndefined();
    expect(escolherVeredito([])).toBeUndefined();
  });
});

describe('veredito do the-judge · avaliação', () => {
  it('Dado veredito do SHA atual, de outro revisor e sem bloqueante, Quando avalia, Então aprova', () => {
    const achados = [{ severidade: 'importante', titulo: 'Nome ruim' }];
    expect(avaliarVeredito(veredito({ achados }), alvo)).toEqual({
      aprovado: true,
      motivos: [],
      bloqueantes: [],
    });
    expect(formatarAvaliacao(avaliarVeredito(veredito(), alvo))).toBe(
      '✓ veredito do the-judge: aprovado (sem achado bloqueante)',
    );
  });

  it('Dado veredito com achado bloqueante, Quando avalia, Então reprova e lista o achado', () => {
    const r = avaliarVeredito(
      veredito({
        achados: [bloqueante, { severidade: 'sugestao', titulo: 'x' }],
      }),
      alvo,
    );
    expect(r.aprovado).toBe(false);
    expect(r.motivos).toEqual(['1 achado(s) bloqueante(s)']);
    expect(r.bloqueantes).toHaveLength(1);
    expect(formatarAvaliacao(r)).toContain(
      '· bloqueante: Vaza dado entre clínicas (src/a.ts:12)',
    );
  });

  it('Dado bloqueante sem arquivo ou sem linha, Quando formata, Então omite o que falta', () => {
    const sem = avaliarVeredito(
      veredito({ achados: [{ severidade: 'bloqueante', titulo: 'A' }] }),
      alvo,
    );
    expect(formatarAvaliacao(sem)).toContain('· bloqueante: A\n'.trimEnd());
    const semLinha = avaliarVeredito(
      veredito({
        achados: [{ severidade: 'bloqueante', titulo: 'B', arquivo: 'x.ts' }],
      }),
      alvo,
    );
    expect(formatarAvaliacao(semLinha)).toContain('· bloqueante: B (x.ts)');
  });

  it('Dado veredito de commit antigo, Quando avalia, Então reprova por SHA', () => {
    const r = avaliarVeredito(veredito({ sha: OUTRO }), alvo);
    expect(r.aprovado).toBe(false);
    expect(r.motivos[0]).toContain(
      'veredito é do commit bbbbbbb, não do head aaaaaaa',
    );
  });

  it('Dado revisor igual ao autor da PR ou do veredito, Quando avalia, Então reprova: autor não aprova a si mesmo', () => {
    for (const v of [
      veredito({ revisor: 'Thread-Autora' }),
      veredito({ autor: 'outro', revisor: 'outro' }),
    ]) {
      const r = avaliarVeredito(v, alvo);
      expect(r.aprovado).toBe(false);
      expect(r.motivos.join()).toContain('o autor não aprova a si mesmo');
    }
  });

  it('Dado veredito que declara outro autor, Quando avalia, Então reprova', () => {
    const r = avaliarVeredito(veredito({ autor: 'outra-thread' }), alvo);
    expect(r.aprovado).toBe(false);
    expect(r.motivos).toEqual([
      'o autor declarado no veredito não é o autor da PR',
    ]);
  });

  it('Dado sem veredito ou inválido, Quando avalia, Então reprova fechado', () => {
    expect(avaliarVeredito(undefined, alvo).motivos).toEqual([
      'nenhum veredito do the-judge encontrado',
    ]);
    expect(avaliarVeredito(null, alvo).motivos[0]).toContain(
      'veredito inválido',
    );
    expect(avaliarVeredito({}, alvo).aprovado).toBe(false);
  });

  it('Dado vários problemas, Quando avalia, Então acumula todos os motivos', () => {
    const r = avaliarVeredito(
      veredito({ sha: OUTRO, revisor: 'thread-autora', achados: [bloqueante] }),
      alvo,
    );
    expect(r.motivos).toHaveLength(3);
    expect(formatarAvaliacao(r)).toContain(
      '✗ veredito do the-judge reprovado:',
    );
  });
});

describe('veredito do the-judge · linha de comando', () => {
  const raiz = path.resolve(import.meta.dirname, '../..');
  const dir = mkdtempSync(path.join(tmpdir(), 'check-veredito-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const escrever = (nome: string, conteudo: unknown): string => {
    const caminho = path.join(dir, nome);
    writeFileSync(
      caminho,
      typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo),
    );
    return caminho;
  };
  const cli = (...args: string[]) =>
    spawnSync(
      path.join(raiz, 'node_modules/.bin/tsx'),
      [path.join(raiz, 'scripts/release/veredito-judge.ts'), ...args],
      {
        cwd: dir,
        encoding: 'utf8',
      },
    );

  it('Dado veredito limpo num arquivo, Quando roda o CLI, Então sai com 0', () => {
    const arquivo = escrever('limpo.json', veredito());
    const r = cli(
      '--autor',
      'thread-autora',
      '--sha',
      SHA,
      '--arquivo',
      arquivo,
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('aprovado');
  });

  it('Dado veredito com achado bloqueante, Quando roda o CLI, Então o check reprova com 1', () => {
    const arquivo = escrever('bloq.json', veredito({ achados: [bloqueante] }));
    const r = cli(
      '--autor',
      'thread-autora',
      '--sha',
      SHA,
      '--arquivo',
      arquivo,
    );
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('bloqueante: Vaza dado entre clínicas');
  });

  it('Dado lista de comentários, Quando roda o CLI, Então vale o último veredito', () => {
    const lista = escrever('comentarios.json', [
      JSON.stringify(veredito({ achados: [bloqueante] })),
      'conversa',
      JSON.stringify(veredito()),
    ]);
    expect(
      cli('--autor', 'thread-autora', '--sha', SHA, '--comentarios', lista)
        .status,
    ).toBe(0);
  });

  it('Dado nenhum arquivo e nenhum --sha, Quando roda o CLI, Então reprova por falta de veredito usando o HEAD do repo', () => {
    const r = cli('--autor', 'thread-autora');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('nenhum veredito');
  });

  it('Dado sem --autor, Quando roda o CLI, Então falha com mensagem de uso', () => {
    const r = cli();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--autor');
  });
});
