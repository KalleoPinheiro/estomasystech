# Validação — extração de `expectToast` (issue #142)

**Verdict: PASS**

Commit: `09b3b68` (branch `fix/142-toast-locator-e2e-duplicado`)

## Call sites (comparado com HEAD~1)

| Spec | Texto original | Migrado para `expectToast`? | Argumento preservado? |
|---|---|---|---|
| `e2e/agenda.spec.ts:181` | `/Grade salva/` (regex) | Sim | Sim, idêntico |
| `e2e/portal-paciente.spec.ts:45` | `"Termo de consentimento aceito"` (string) | Sim | Sim, idêntico |
| `e2e/portal-paciente.spec.ts:66-69` | `"Foto enviada — a equipe vai avaliar e retorna se for preciso antecipar sua consulta."` (string) | Sim | Sim, idêntico |

Helper novo `e2e/support/assertions.ts`: `expectToast(page, text) = expect(page.getByText(text).first()).toBeVisible()` — mesma semântica de `.first()` que antes.

## Escopo do diff

`grep -rn "\.first()" e2e/` mostra 7 outras ocorrências de `.first()` em outros arquivos (`sidebar-responsive.spec.ts`, `responsive-tables.spec.ts`, `clinico.spec.ts`, `auditoria.spec.ts`, `relatorios.spec.ts`, `documentos.spec.ts`) — nenhuma tocada pelo commit; todas são locators não relacionados a toast. `git diff HEAD~1 HEAD --stat` confirma apenas os 3 arquivos esperados.

## Execução

- `npx playwright test e2e/agenda.spec.ts e2e/portal-paciente.spec.ts` → **PASS (8) FAIL (0)**, 41.1s (container `estomasystech-app-1` parado antes e reiniciado depois).
- `npm run typecheck` → limpo, sem erros.

## Conclusão

Refatoração mecânica correta: mesmos 3 call sites, mesmo texto/regex, mesma semântica `.first()`, nenhum efeito colateral em outros usos de `.first()`. Testes e typecheck confirmam comportamento inalterado.
