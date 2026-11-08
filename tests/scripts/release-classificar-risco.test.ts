import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CAMINHOS_SENSIVEIS,
  classificarRisco,
  formatarRisco,
  lerRelatorioMigracao,
  pacoteSensivel,
  pacotesAlterados,
  pacotesAlteradosLock,
  type RelatorioMigracao,
  SCHEMA_RISCO,
  saidaGithub,
  scriptDePortao,
  scriptsAlterados,
  somenteDocsOuTeste,
} from '../../scripts/release/classificar-risco-lib';

const aditiva: RelatorioMigracao = { ok: true, classificacao: 'aditiva' };
const risco = (
  arquivos: string[],
  migracao: RelatorioMigracao | null = null,
  pacotes: string[] = [],
  scripts: string[] = [],
) =>
  classificarRisco({
    arquivos,
    migracao,
    pacotesAlterados: pacotes,
    scriptsAlterados: scripts,
  });

describe('classe de risco · classes 0 e 1', () => {
  it('Dado diff só em docs e testes, Quando classifica, Então classe 0 sem aprovação humana', () => {
    const r = risco([
      'docs/engineering/x.md',
      'tests/domain/a.test.ts',
      'e2e/a.spec.ts',
      'CONTEXT.md',
      '.changeset/a.md',
    ]);
    expect(r).toMatchObject({
      schema: SCHEMA_RISCO,
      classe: 0,
      aprovacaoHumana: false,
    });
    expect(r.motivos.every((m) => m.regra === 'docs-ou-teste')).toBe(true);
  });

  it('Dado diff vazio, Quando classifica, Então classe 0 com motivo diff-vazio', () => {
    expect(risco([])).toMatchObject({
      classe: 0,
      motivos: [{ regra: 'diff-vazio' }],
    });
  });

  it('Dado código de aplicação sem migração, Quando classifica, Então classe 1', () => {
    const r = risco([
      'docs/a.md',
      'src/application/agenda/book.ts',
      'src/app/page.tsx',
    ]);
    expect(r).toMatchObject({ classe: 1, aprovacaoHumana: false });
    expect(r.motivos.map((m) => m.arquivo)).toEqual([
      'src/application/agenda/book.ts',
      'src/app/page.tsx',
    ]);
  });

  it('Dado .md dentro de src ou scripts, Quando decide se é documentação, Então não é (é código ou pipeline)', () => {
    expect(somenteDocsOuTeste('src/app/LEIAME.md')).toBe(false);
    expect(somenteDocsOuTeste('scripts/gate/README.md')).toBe(false);
    expect(somenteDocsOuTeste('docs/a.md')).toBe(true);
    expect(somenteDocsOuTeste('tests/support/x.ts')).toBe(true);
    expect(somenteDocsOuTeste('src/lib/a.ts')).toBe(false);
  });
});

describe('classe de risco · classe 2 (migração aditiva)', () => {
  it('Dado migração aditiva sem caminho sensível, Quando classifica, Então classe 2', () => {
    const r = risco(
      [
        'drizzle/0071_x.sql',
        'drizzle/meta/_journal.json',
        'src/application/a.ts',
      ],
      aditiva,
    );
    expect(r).toMatchObject({ classe: 2, aprovacaoHumana: false });
    expect(r.motivos.map((m) => m.regra)).toEqual([
      'migracao-aditiva',
      'migracao-aditiva',
    ]);
  });

  it('Dado migração aditiva e também um caminho sensível, Quando classifica, Então vence a classe 3', () => {
    const r = risco(['drizzle/0071_x.sql', 'src/lib/data-cipher.ts'], aditiva);
    expect(r.classe).toBe(3);
    expect(r.motivos).toEqual([
      expect.objectContaining({
        regra: 'cifra',
        arquivo: 'src/lib/data-cipher.ts',
      }),
    ]);
  });

  it('Dado tocou drizzle/ mas o lint não achou migração nova, Quando classifica, Então classe 1', () => {
    expect(
      risco(['drizzle/meta/0070_snapshot.json'], {
        ok: true,
        classificacao: 'nenhuma',
      }).classe,
    ).toBe(1);
  });
});

describe('classe de risco · classe 3 (migração)', () => {
  it.each([
    [
      'não aditiva',
      { ok: true, classificacao: 'nao_aditiva' } as RelatorioMigracao,
      'migracao-nao-aditiva',
    ],
    [
      'com erro estrutural',
      { ok: false, classificacao: 'aditiva' } as RelatorioMigracao,
      'migracao-com-erro',
    ],
    ['sem relatório (falha fechada)', null, 'migracao-sem-relatorio'],
  ])(
    'Dado migração %s, Quando classifica, Então classe 3 com aprovação humana',
    (_nome, migracao, regra) => {
      const r = risco(['drizzle/0071_x.sql'], migracao);
      expect(r).toMatchObject({ classe: 3, aprovacaoHumana: true });
      expect(r.motivos[0].regra).toBe(regra);
    },
  );

  it('Dado JSON do check:migracao, Quando lê, Então só aceita o schema e as formas conhecidas', () => {
    const valido = {
      schema: 'check-migracao/v1',
      ok: true,
      classificacao: 'nao_aditiva',
      migracoes: [],
    };
    expect(lerRelatorioMigracao(valido)).toEqual({
      ok: true,
      classificacao: 'nao_aditiva',
    });
    for (const ruim of [
      null,
      'texto',
      { ...valido, schema: 'check-migracao/v2' },
      { ...valido, ok: 'sim' },
      { ...valido, classificacao: 'talvez' },
      { ...valido, classificacao: 7 },
    ]) {
      expect(lerRelatorioMigracao(ruim)).toBeNull();
    }
  });
});

describe('classe de risco · classe 3 (caminhos sensíveis)', () => {
  it.each([
    [
      'src/infrastructure/persistence/drizzle/tenant-scope.ts',
      'escopo-de-empresa',
    ],
    ['src/lib/auth/tenant-scope.ts', 'escopo-de-empresa'],
    ['src/lib/auth/clinical-resource-scope.ts', 'escopo-de-empresa'],
    ['tests/lib/tenant-scope.test.ts', 'escopo-de-empresa'],
    ['src/domain/auth/auth-token.ts', 'auth'],
    ['src/lib/auth/session.ts', 'auth'],
    ['src/proxy.ts', 'auth'],
    ['src/lib/data-cipher.ts', 'cifra'],
    ['src/lib/auth/crypto.ts', 'cifra'],
    ['scripts/reencrypt-clinical-data.ts', 'cifra'],
    [
      'src/infrastructure/persistence/drizzle/reencrypt-clinical-data.ts',
      'cifra',
    ],
    ['src/domain/audit/audit-event.ts', 'auditoria'],
    ['src/application/audit/list-audit.ts', 'auditoria'],
    [
      'src/infrastructure/persistence/drizzle/drizzle-audit-event-repository.ts',
      'auditoria',
    ],
    ['Dockerfile', 'imagem-e-deploy'],
    ['deploy/compose.yaml', 'imagem-e-deploy'],
    ['.github/workflows/ci.yml', 'workflow'],
    ['.github/CODEOWNERS', 'workflow'],
    ['scripts/gate/base.ts', 'portao'],
    ['scripts/gate/LEIAME.md', 'portao'],
    ['scripts/gate-cloud.sh', 'portao'],
    ['scripts/gate-cloud/x.sh', 'portao'],
    ['scripts/release/cut.ts', 'portao'],
    ['.husky/pre-push', 'portao'],
    ['.claude/hooks/protect-tests.sh', 'portao'],
    ['.claude/settings.json', 'portao'],
    ['vitest.config.mts', 'portao'],
    ['vitest.mutacao.config.mts', 'portao'],
    ['stryker.config.json', 'portao'],
    ['playwright.config.ts', 'portao'],
    ['biome.json', 'portao'],
    ['scripts/check-docs.ts', 'portao'],
    ['scripts/check-server-first.ts', 'portao'],
    ['scripts/check-dynamic-import.ts', 'portao'],
    ['scripts/check-sv-adoption.sh', 'portao'],
    ['scripts/docker-smoke.sh', 'portao'],
    ['.gate/motivo-teste.txt', 'portao'],
    ['scripts/backup.sh', 'dados-de-producao'],
    ['scripts/restore.sh', 'dados-de-producao'],
    ['scripts/backup-alert.sh', 'dados-de-producao'],
    ['scripts/backup-smoke.sh', 'dados-de-producao'],
    ['scripts/backup-target.sh', 'dados-de-producao'],
  ])(
    'Dado diff que toca %s, Quando classifica, Então classe 3 pela regra %s',
    (arquivo, regra) => {
      const r = risco(['docs/a.md', arquivo]);
      expect(r).toMatchObject({ classe: 3, aprovacaoHumana: true });
      expect(r.motivos).toEqual([expect.objectContaining({ regra, arquivo })]);
    },
  );

  it.each([
    'src/domain/patient/patient.ts',
    'src/application/agenda/book.ts',
    'src/lib/format.ts',
    'src/lib/auth-ui-copy.ts',
    'tests/scripts/release-x.test.ts',
    'scripts/seed/seed.ts',
    'vitest-setup.ts',
  ])('Dado %s, Quando classifica, Então não é caminho sensível', (arquivo) => {
    expect(risco([arquivo]).classe).toBeLessThan(3);
  });

  it('Dado a lista de caminhos sensíveis, Quando confere, Então cada regra tem nome e explicação', () => {
    for (const r of CAMINHOS_SENSIVEIS)
      expect(r.regra && r.detalhe).toBeTruthy();
  });
});

describe('classe de risco · dependências', () => {
  it.each([
    'next',
    'drizzle-orm',
    'pg',
    '@aws-sdk/client-s3',
    'googleapis',
    'sharp',
    'argon2',
    'jose',
    'next-auth',
  ])(
    'Dado %s alterado em package.json, Quando classifica, Então classe 3',
    (pacote) => {
      expect(pacoteSensivel(pacote)).toBe(true);
      const r = risco(['package.json', 'package-lock.json'], null, [pacote]);
      expect(r).toMatchObject({ classe: 3 });
      expect(r.motivos[0]).toMatchObject({
        regra: 'dependencia-sensivel',
        detalhe: `dependência sensível alterada: ${pacote}`,
      });
    },
  );

  it('Dado dependência comum ou nenhuma, Quando classifica, Então fica na classe de código', () => {
    expect(pacoteSensivel('zod')).toBe(false);
    expect(risco(['package.json'], null, ['zod', 'vitest']).classe).toBe(1);
    expect(risco(['package.json'], null, []).classe).toBe(1);
  });

  it('Dado dois package.json, Quando compara, Então lista só pacotes que mudaram, entraram ou saíram', () => {
    const antes = {
      dependencies: { next: '^16.3.5', zod: '^4.6.7' },
      devDependencies: { vitest: '^4.0.0', velho: '1.0.0' },
    };
    const depois = {
      dependencies: { next: '^16.3.6', zod: '^4.6.7' },
      devDependencies: { vitest: '^4.0.0', novo: '2.0.0' },
      optionalDependencies: { fsevents: '1.0.0' },
    };
    expect(pacotesAlterados(antes, depois)).toEqual([
      'fsevents',
      'next',
      'novo',
      'velho',
    ]);
    expect(pacotesAlterados(antes, antes)).toEqual([]);
    expect(pacotesAlterados(null, { dependencies: { a: '1' } })).toEqual(['a']);
  });
});

describe('classe de risco · comandos de portão em package.json', () => {
  it.each([
    'check:docs',
    'check:sv',
    'test',
    'test:coverage',
    'gate:local',
    'lint',
    'typecheck',
    'build',
  ])(
    'Dado o script %s alterado, Quando classifica, Então classe 3 pela regra portao',
    (nome) => {
      expect(scriptDePortao(nome)).toBe(true);
      const r = risco(['package.json'], null, [], [nome]);
      expect(r).toMatchObject({ classe: 3, aprovacaoHumana: true });
      expect(r.motivos[0]).toMatchObject({
        regra: 'portao',
        detalhe: `comando de portão alterado: ${nome}`,
      });
    },
  );

  it('Dado script que não é portão ou nenhum script alterado, Quando classifica, Então fica classe 1', () => {
    for (const nome of [
      'dev',
      'start',
      'db:migrate',
      'changeset',
      'prebuild',
      'attest',
    ])
      expect(scriptDePortao(nome)).toBe(false);
    expect(risco(['package.json'], null, [], ['dev']).classe).toBe(1);
    expect(risco(['package.json'], null, [], []).classe).toBe(1);
  });

  it('Dado dois package.json, Quando compara scripts, Então lista os que mudaram, entraram ou saíram', () => {
    const antes = { scripts: { build: 'a', dev: 'b', velho: 'c' } };
    const depois = { scripts: { build: 'a2', dev: 'b', novo: 'd' } };
    expect(scriptsAlterados(antes, depois)).toEqual(['build', 'novo', 'velho']);
    expect(scriptsAlterados(antes, antes)).toEqual([]);
    expect(scriptsAlterados(null, { scripts: { x: '1' } })).toEqual(['x']);
    expect(scriptsAlterados(null, {})).toEqual([]);
  });
});

describe('classe de risco · lockfile', () => {
  it('Dado mudança só no lockfile sem dependência sensível, Quando classifica, Então classe 2', () => {
    const r = risco(['package-lock.json'], null, ['lodash']);
    expect(r).toMatchObject({ classe: 2, aprovacaoHumana: false });
    expect(r.motivos[0].regra).toBe('lockfile');
  });

  it('Dado lockfile que muda dependência sensível de runtime, Quando classifica, Então classe 3', () => {
    expect(risco(['package-lock.json'], null, ['jose']).classe).toBe(3);
  });

  it('Dado dois lockfiles, Quando compara, Então lista só runtime que mudou, entrou ou saiu', () => {
    const antes = {
      packages: {
        '': { version: '1' },
        'node_modules/jose': { version: '1.0.0' },
        'node_modules/a/node_modules/zod': { version: '1.0.0' },
        'node_modules/vitest': { version: '1.0.0', dev: true },
        'node_modules/igual': { version: '1.0.0' },
        'node_modules/velho': { version: '1.0.0' },
      },
    };
    const depois = {
      packages: {
        '': { version: '2' },
        'node_modules/jose': { version: '1.0.1' },
        'node_modules/a/node_modules/zod': { version: '1.0.0' },
        'node_modules/vitest': { version: '2.0.0', dev: true },
        'node_modules/igual': { version: '1.0.0' },
        'node_modules/novo': { version: '3.0.0' },
      },
    };
    expect(pacotesAlteradosLock(antes, depois)).toEqual([
      'jose',
      'novo',
      'velho',
    ]);
    expect(pacotesAlteradosLock(null, {})).toEqual([]);
    expect(
      pacotesAlteradosLock(null, {
        packages: { 'node_modules/x': { version: '1' } },
      }),
    ).toEqual(['x']);
  });
});

describe('classe de risco · saída', () => {
  it('Dado classe 3, Quando formata, Então lista os motivos e pede aprovação', () => {
    const texto = formatarRisco(
      risco(['scripts/gate/base.ts', 'src/proxy.ts']),
    );
    expect(texto).toContain('Classe de risco: 3 (exige aprovação humana)');
    expect(texto).toContain('[portao] scripts/gate/base.ts');
    expect(texto).toContain('[auth] src/proxy.ts');
  });

  it('Dado classe 0 sem arquivo, Quando formata, Então não pede aprovação e mostra (diff)', () => {
    expect(formatarRisco(risco([]))).toBe(
      'Classe de risco: 0\n  - [diff-vazio] (diff): nenhum arquivo no diff',
    );
  });

  it('Dado resultado, Quando formata para o Actions, Então devolve chave=valor', () => {
    expect(saidaGithub(risco(['src/proxy.ts']))).toBe(
      'classe=3\naprovacao_humana=true',
    );
    expect(saidaGithub(risco(['docs/a.md']))).toBe(
      'classe=0\naprovacao_humana=false',
    );
  });
});

describe('classe de risco · linha de comando', () => {
  const raiz = path.resolve(import.meta.dirname, '../..');
  const dir = mkdtempSync(path.join(tmpdir(), 'check-risco-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const git = (...args: string[]): void => {
    const r = spawnSync(
      'git',
      ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(r.stderr);
  };
  const escrever = (arquivo: string, texto: string): void => {
    mkdirSync(path.dirname(path.join(dir, arquivo)), { recursive: true });
    writeFileSync(path.join(dir, arquivo), texto);
  };
  const commit = (msg: string): void => {
    git('add', '-A');
    git('commit', '-q', '-m', msg);
  };
  const cli = (...args: string[]) =>
    spawnSync(
      path.join(raiz, 'node_modules/.bin/tsx'),
      [path.join(raiz, 'scripts/release/classificar-risco.ts'), ...args],
      {
        cwd: dir,
        encoding: 'utf8',
      },
    );
  const relatorio = (classificacao: string): string =>
    JSON.stringify({
      schema: 'check-migracao/v1',
      ok: true,
      classificacao,
      migracoes: [],
      erros: [],
    });
  const pacote = (deps: Record<string, string>): string =>
    JSON.stringify({ name: 'x', version: '1.0.0', dependencies: deps });

  it('Dado um repo real com commits de docs, código, migração, dependência e portão, Quando roda o CLI, Então a classe sobe a cada passo', () => {
    git('init', '-q', '-b', 'main');
    escrever('docs/a.md', '# a\n');
    escrever('package.json', pacote({ next: '1.0.0', zod: '1.0.0' }));
    commit('base');
    git('tag', 'base');

    escrever('docs/b.md', '# b\n');
    commit('docs');
    expect(JSON.parse(cli('--base', 'base', '--json').stdout)).toMatchObject({
      classe: 0,
      aprovacaoHumana: false,
    });

    escrever('src/app/page.tsx', 'export {};\n');
    commit('codigo');
    expect(cli('--base', 'base').stdout).toContain('Classe de risco: 1');
    expect(cli('--base', 'base', '--saida-github').stdout.trim()).toBe(
      'classe=1\naprovacao_humana=false',
    );

    escrever('drizzle/0001_n.sql', 'ALTER TABLE a ADD COLUMN x text;');
    escrever('relatorio.json', relatorio('aditiva'));
    commit('migracao');
    expect(
      JSON.parse(
        cli('--base', 'base', '--json', '--migracao', 'relatorio.json').stdout,
      ).classe,
    ).toBe(2);
    escrever('relatorio.json', relatorio('nao_aditiva'));
    expect(
      JSON.parse(
        cli('--base', 'base', '--json', '--migracao', 'relatorio.json').stdout,
      ).classe,
    ).toBe(3);
    escrever('relatorio.json', '{ quebrado');
    expect(
      JSON.parse(
        cli('--base', 'base', '--json', '--migracao', 'relatorio.json').stdout,
      ).motivos[0].regra,
    ).toBe('migracao-sem-relatorio');
    // Sem --migracao e sem scripts/release/check-migracao.ts no repo: o lint não roda e a classe é 3 (falha fechada).
    expect(JSON.parse(cli('--base', 'base', '--json').stdout).classe).toBe(3);

    escrever('package.json', pacote({ next: '1.0.1', zod: '2.0.0' }));
    commit('dependencias');
    const dep = JSON.parse(
      cli('--base', 'base', '--json', '--migracao', 'relatorio.json').stdout,
    );
    expect(dep.motivos.map((m: { regra: string }) => m.regra)).toContain(
      'migracao-sem-relatorio',
    );
    escrever('relatorio.json', relatorio('aditiva'));
    const depOk = JSON.parse(
      cli('--base', 'base', '--json', '--migracao', 'relatorio.json').stdout,
    );
    expect(depOk).toMatchObject({
      classe: 3,
      motivos: [
        {
          regra: 'dependencia-sensivel',
          detalhe: expect.stringContaining('next'),
        },
      ],
    });

    escrever(
      'package-lock.json',
      JSON.stringify({
        packages: { 'node_modules/lodash': { version: '1.0.0' } },
      }),
    );
    commit('lock');
    escrever(
      'package-lock.json',
      JSON.stringify({
        packages: { 'node_modules/lodash': { version: '1.0.1' } },
      }),
    );
    commit('lock2');
    escrever(
      'package.json',
      JSON.stringify({
        name: 'x',
        version: '1.0.0',
        dependencies: { next: '1.0.1', zod: '2.0.0' },
        scripts: { 'check:docs': 'x' },
      }),
    );
    commit('script de portao');
    expect(
      cli('--base', 'base', '--json', '--migracao', 'relatorio.json').stdout,
    ).toContain('comando de portão alterado: check:docs');
    escrever('.github/workflows/x.yml', 'name: x\n');
    commit('workflow');
    expect(cli('--base', 'base').stdout).toContain(
      '[workflow] .github/workflows/x.yml',
    );
  });

  it('Dado base inexistente, Quando roda o CLI, Então falha com mensagem', () => {
    const r = cli('--base', 'nao-existe');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('git diff contra nao-existe falhou');
  });
});
