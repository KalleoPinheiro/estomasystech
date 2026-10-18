# Documentação em Progressive Disclosure verification

**Verdict**: PASS
**Profile**: light
**Diff range**: dce45f5..10dce03
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 2 com escopo no fix `e1a0490..10dce03` (`checks.md`, `tests/docs/structure.test.ts`, `tests/scripts/check-docs.test.ts`; nenhum arquivo de produção ou doc tocado). Todas as provas rodaram de novo em `10dce03` numa única invocação: 88 testes, 0 falhas; cada nome de `-t` de `checks.md` casa ≥ 1 teste executado e aprovado. O mutante sobrevivente da Round 1 agora é morto por C26, e as duas superfícies novas (linha completa em C19, conjunto exato em C6) também matam as faltas injetadas. Citações de C6, C16, C19 e C26 foram refeitas em `10dce03`; as demais linhas vêm de `e1a0490` (arquivos de produção e docs inalterados pelo fix; em `structure.test.ts` os números de linha após `:155` deslocaram +7 com o novo teste de C6).

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `AGENTS.md` ≤ 150 linhas | `npx vitest run tests/docs/structure.test.ts tests/scripts/check-docs.test.ts --reporter=verbose` exit 0 (`-t "AGENTS.md tem no máximo 150 linhas"` presente) - carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/docs/structure.test.ts:112` - `expect(lineCount(agents)).toBeLessThanOrEqual(150)` (real: 93 linhas) (carried from e1a0490) | PASS |
| C2 | H2 de `AGENTS.md` na ordem Produto, Comandos, Regras invioláveis, Mapa de contexto, Agent skills | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/docs/structure.test.ts:124-125` - `expect(h2).toContain(name)` + `expect(inOrder(h2, expected)).toBe(true)` (carried from e1a0490) | PASS |
| C3 | Mapa de contexto com as 3 colunas e uma linha linkando cada um dos 9 domínios | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/docs/structure.test.ts:130-137` - `expect(rows[0]).toEqual(['Se vai mexer em','Leia primeiro','Depois, se precisar'])` + `expect(firstColumnLinks).toContain(\`docs/domains/${domain}/README.md\`)` (carried from e1a0490) | PASS |
| C4 | Pontes Copilot/Cursor existem, ≤ 15 linhas, linkam `AGENTS.md` | carried from e1a0490; re-ran at 10dce03, exit 0 (2 casos `.github/copilot-instructions.md`, `.cursor/rules/00-estomasystech.mdc`) | `tests/docs/structure.test.ts:146-147` - `expect(lineCount(text)).toBeLessThanOrEqual(15)` + `expect(text).toContain('AGENTS.md')` (carried from e1a0490) | PASS |
| C5 | `README.md` ≤ 120 linhas e sem a linha de cabeçalho `Variável` da tabela de variáveis | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/docs/structure.test.ts:152-153` - `toBeLessThanOrEqual(120)` + `expect(readme).not.toMatch(<regex do cabeçalho Variável>)` (real: 75 linhas) (carried from e1a0490) | PASS |
| C6 | Existem os 9 `docs/domains/<slug>/README.md` (e nenhum outro diretório de domínio) | `npx vitest run tests/docs/structure.test.ts tests/scripts/check-docs.test.ts --reporter=verbose` exit 0 (`-t "existem os 9 domínios"` casa 10 testes) - verified at 10dce03 | `tests/docs/structure.test.ts:162` - `expect([...dirs].sort()).toEqual([...DOMAINS].sort())`; `:165-166` - `expect(existsSync(join(ROOT,'docs/domains',domain,'README.md'))).toBe(true)` | PASS |
| C7 | README de domínio com H2 Resumo..Decisões na ordem | carried from e1a0490; re-ran at 10dce03, exit 0 (9 casos) | `tests/docs/structure.test.ts:175-176` - `expect(h2).toContain(name)` + `expect(inOrder(h2, expected)).toBe(true)` (carried from e1a0490) | PASS |
| C8 | Sem frontmatter / sem chave → sai 1 nomeando arquivo e chave | carried from e1a0490; re-ran at 10dce03, exit 0 (`frontmatter ausente` + 5 casos `chave de frontmatter ausente`) | `tests/scripts/check-docs.test.ts:83-85` - `expect(result.status).toBe(1)`, `toContain('docs/sem-meta.md')`, `toContain('frontmatter')`; `:93-95` - `toBe(1)`, `toContain('docs/incompleto.md')`, `toContain(key)` (carried from e1a0490) | PASS |
| C9 | `status` inválido → sai 1 | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/scripts/check-docs.test.ts:102-104` - `expect(result.status).toBe(1)` + `toContain('published')` (carried from e1a0490) | PASS |
| C10 | Os 4 status válidos saem 0 | carried from e1a0490; re-ran at 10dce03, exit 0 (4 casos) | `tests/scripts/check-docs.test.ts:111` - `expect(runGate(root)).toMatchObject({ status: 0 })` (carried from e1a0490) | PASS |
| C11 | `docs/README.md` linka todo `.md` de `docs/` exceto `domains/*/features/` | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/docs/structure.test.ts:193` - `expect(missing).toEqual([])` sobre `walk('docs')` real (carried from e1a0490) | PASS |
| C12 | Árvore real passa em `check:docs` com saída 0 | carried from e1a0490; re-ran at 10dce03, exit 0; também `npm run check:docs` exit 0 (`OK (0 aviso(s))`) | `tests/docs/structure.test.ts:198-202` - `expect(() => execFileSync(tsx, [script, ROOT])).not.toThrow()` (carried from e1a0490) | PASS |
| C13 | 5 templates em `docs/templates/` | carried from e1a0490; re-ran at 10dce03, exit 0 (5 casos) | `tests/docs/structure.test.ts:214` - `expect(existsSync(join(ROOT,'docs/templates',file))).toBe(true)` (carried from e1a0490) | PASS |
| C14 | `feature-spec.md` com as 8 H2 na ordem | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/docs/structure.test.ts:229-230` - `toContain(name)` + `expect(inOrder(h2, expected)).toBe(true)` (carried from e1a0490) | PASS |
| C15 | `Critérios de aceite` com bloco `gherkin` iniciando em `# language: pt` | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/docs/structure.test.ts:238` - `expect(block).toMatch(/\`\`\`gherkin\n# language: pt\n/)` (carried from e1a0490) | PASS |
| C16 | Tabela de variáveis só no onboarding; README e AGENTS linkam o onboarding | mesma invocação, exit 0 - verified at 10dce03 | `tests/docs/structure.test.ts:258-260` - `expect(withTable).toEqual(['docs/engineering/onboarding.md'])` + `expect(read('README.md')).toContain('](docs/engineering/onboarding.md)')` + idem `AGENTS.md` | PASS |
| C17 | 5 arquivos de integração | carried from e1a0490; re-ran at 10dce03, exit 0 (5 casos) | `tests/docs/structure.test.ts:257` - `expect(existsSync(join(ROOT,'docs/engineering/integrations',file))).toBe(true)` (carried from e1a0490) | PASS |
| C18 | Cada integração com as 5 H2 | carried from e1a0490; re-ran at 10dce03, exit 0 (5 casos) | `tests/docs/structure.test.ts:271` - `expect(h2).toContain(name)` para as 5 seções (carried from e1a0490) | PASS |
| C19 | Troubleshooting contém os 8 sintomas de `setup-local.md`, cada um como linha completa sintoma/causa/ação | mesma invocação, exit 0 (8 casos) - verified at 10dce03 | `tests/docs/structure.test.ts:299-301` - `expect(row).toBeDefined()`, `expect(row?.length).toBe(3)`, `expect(row?.every((cell) => cell.length > 0)).toBe(true)` | PASS |
| C20 | Tabelas Now/Next/Later com `id` RM-NN e colunas status/issue/spec | carried from e1a0490; re-ran at 10dce03, exit 0 (3 casos) | `tests/docs/structure.test.ts:315-320` - `expect(header).toEqual(expect.arrayContaining(['id','status','issue','spec']))`, `rows.length > 0`, `toMatch(/^RM-\d{2}$/)` (carried from e1a0490) | PASS |
| C21 | Linha `entregue` linka diretório existente em `.specs/features/` | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/docs/structure.test.ts:329-330` - `expect(relative(ROOT, abs)).toMatch(/^\.specs\/features\/[^/]+\/?$/)` + `expect(existsSync(abs) && statSync(abs).isDirectory()).toBe(true)` (carried from e1a0490) | PASS |
| C22 | Todo status do roadmap no vocabulário de 5 | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/docs/structure.test.ts:337` - `expect(ROADMAP_STATUS).toContain(row.status)` (carried from e1a0490) | PASS |
| C23 | Link quebrado → sai 1 e imprime `file:line -> target` | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/scripts/check-docs.test.ts:145-146` - `expect(result.status).toBe(1)` + `toContain('docs/b.md:11 -> c.md')` (carried from e1a0490) | PASS |
| C24 | Link quebrado em AGENTS/CONTEXT/README da raiz é pego | carried from e1a0490; re-ran at 10dce03, exit 0 (3 casos) | `tests/scripts/check-docs.test.ts:154-155` - `toBe(1)` + `toContain(\`${file}:3 -> docs/nao-existe.md\`)` (carried from e1a0490) | PASS |
| C25 | Templates não checados; externo, âncora e código ignorados | carried from e1a0490; re-ran at 10dce03, exit 0 (`ignora templates` + `ignora externos, âncoras e código`) | `tests/scripts/check-docs.test.ts:179` e `:197` - `expect(runGate(root)).toMatchObject({ status: 0 })` com links inexistentes plantados (carried from e1a0490) | PASS |
| C26 | `living` > 90 dias avisa e sai 0; `frozen`, `draft` e `superseded` antigos não avisam | mesma invocação, exit 0 (4 casos) - verified at 10dce03 | `tests/scripts/check-docs.test.ts:131-132` - `expect(result.status).toBe(0)` + `toMatch(/aviso.*docs\/velho\.md/i)`; `:135-144` (table-driven `['frozen','draft','superseded']`) - `expect(result.status).toBe(0)` + `expect(result.output).not.toContain('docs/antigo.md')` | PASS |
| C27 | `last_reviewed` fora de `YYYY-MM-DD` → sai 1 | carried from e1a0490; re-ran at 10dce03, exit 0 (3 casos) | `tests/scripts/check-docs.test.ts:120-121` - `expect(result.status).toBe(1)` + `toContain('last_reviewed')` (carried from e1a0490) | PASS |
| C28 | Job que roda `npm run lint` também roda `npm run check:docs` | carried from e1a0490; re-ran at 10dce03, exit 0 (`ci roda check:docs no job de lint`) | `tests/docs/structure.test.ts:346-349` - `expect(lintJob).toContain('npm run check:docs')` + `package.json` `"check:docs": "tsx scripts/check-docs.ts"` (carried from e1a0490) | PASS |
| C29 | `STATE.md` ≤ 250 linhas e sem `CONCLUÍDA` | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/docs/structure.test.ts:355-356` - `toBeLessThanOrEqual(250)` + `expect(state).not.toMatch(/CONCLUÍD[AO]/)` (real: 236 linhas) (carried from e1a0490) | PASS |
| C30 | Seções `CONCLUÍDA` removidas existem em `.specs/archive/` | carried from e1a0490; re-ran at 10dce03, exit 0 | `tests/docs/structure.test.ts:366-368` - `expect(concludedSections.length).toBe(16)`, `toBeGreaterThanOrEqual(30)`, `toContain('.specs/archive/')` (carried from e1a0490) | PASS |

## Faults injected

Scratch `git worktree add --detach` em `10dce03` (node_modules por symlink); cada falta revertida com `git checkout --` / `rm -rf` antes da próxima; worktree removido com `git worktree remove --force` + `prune`. `git status --porcelain` do tree real idêntico antes e depois (`BASELINE_MATCH`; só `?? .specs/features/docs-progressive-disclosure/verification.md`, esperado).

| Mutation | Location | Killed |
| --- | --- | --- |
| aviso de vencido para todo status exceto `frozen` (`status === 'living'` -> `status !== 'frozen'`) - sobrevivente da Round 1 | `scripts/check-docs.ts:78` | yes - C26 (`draft` e `superseded` falham, 2/3 casos) |
| célula de ação da linha `503 em toda rota` esvaziada | `docs/engineering/troubleshooting.md:19` | yes - C19 (`row?.every(cell.length > 0)` falha) |
| 10º diretório de domínio `docs/domains/extra/` com README copiado | `docs/domains/extra/README.md` | yes - C6 (`existem os 9 domínios e nenhum outro`) |

## Findings

Round 1 achados 1, 3, 4 e 7 fechados pelo fix (1: mutante morto; 3: C19 exige a linha de 3 células não vazias; 4: C16 exige `](docs/engineering/onboarding.md)`; 7: o novo teste de C6 compara o conjunto exato de diretórios, então um 10º domínio sem linha no mapa agora quebra C6 - C3 continua com lista fixa, mas o par C3+C6 cobre AC 2). Restantes, todos não bloqueantes (a prova de cada check resolve a própria claim; a lacuna fica além do que o check afirma):

1. **Check mais fraco que o AC - C4 vs AC 3** (Round 1 #2) - teste `pontes apontam para AGENTS.md` em `tests/docs/structure.test.ts`. A claim de C4 (existem, ≤ 15 linhas, linkam `AGENTS.md`) é provada; "sem regra ausente de `AGENTS.md`" não é mecanizável por essa prova e foi conferido manualmente na Round 1 (pontes só apontam). Não bloqueante; regressão futura ficaria sem prova.
2. **Precisão - C30 compara contra constantes** (Round 1 #6) - `tests/docs/structure.test.ts:381-382`. Conferido em `10dce03`: `git show dce45f5:.specs/STATE.md` tem exatamente 16 `## ...CONCLUÍDA` (= a constante) e todas as 16 linhas existem verbatim em `.specs/archive/`; 33 bullets `CONCLUÍD*` contra o limite `>= 30` (folga de 3). Remover uma seção arquivada derruba a contagem, então a prova resolve a claim; não bloqueante.
3. **Precisão - C5/C16 detectam a tabela só pela linha de cabeçalho `Variável`** (Round 1 #5) - `tests/docs/structure.test.ts:153`, `:251-258`. As claims de C5 e C16 são literalmente sobre essa linha de cabeçalho e a prova a resolve; tabela de env com outro cabeçalho está fora da claim. Não bloqueante.
4. **Nível - AC 6 e AC 15 exigidos pela suíte vitest, não por `check:docs`** (Round 1 #8) - C7/C18 provam o que afirmam para a lista fixa; a exigência corre no CI via `test:coverage`. Não bloqueante.

## Gate

`npx vitest run tests/docs/structure.test.ts tests/scripts/check-docs.test.ts --reporter=verbose` - 88 passed, 0 failed (at 10dce03)

`npm run check:docs` - exit 0 (`check:docs: OK (0 aviso(s))`)
