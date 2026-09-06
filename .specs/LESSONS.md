# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

### L-011 — Relatório de scanner externo pode citar versão que não existe na árvore atual: confronte sempre com 'npm ls <pkg>' e 'npm audit' antes de agir — o scan de 2026-08-23 apontou postcss 8.4.31 (era cópia aninhada do next) e omitiu 3 HIGH reais (undici, nanoid, js-yaml).
- signal: `ac_gap` · recurrence: 2 feature(s) · scope: `deps` · harmful: 0
- features: auditoria-seguranca-dependencias, ruido-scanners-seguranca
- evidence: relatorio-gitguard-cmt5621 (deps) (+1 more)
- last seen: 2026-08-24T18:43:26Z

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — Assert time-derived fields with a non-zero elapsed interval, never only at the degenerate just-created value
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: fase-3-compliance-ux-clinico
- evidence: Sensor #5 — src/app/api/photos/triage/route.ts:61; tests/api/audit-lgpd-routes.test.ts:371 (routes)
- last seen: 2026-08-15T09:40:27Z

### L-002 — Cover a guard at the route level with a failing precondition, not only via the domain rule it delegates to
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: fase-3-compliance-ux-clinico
- evidence: COMP3-03 — src/app/api/portal/patient/photos/route.ts:54 (routes)
- last seen: 2026-08-15T09:40:27Z

### L-003 — Prove the scope of a guard with a multi-entity fixture when the spec states the scope explicitly
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `routes` · harmful: 0
- features: fase-3-compliance-ux-clinico
- evidence: Edge case 'gate por paciente' — src/app/api/portal/patient/photos/route.ts:53 (routes)
- last seen: 2026-08-15T09:40:27Z

### L-004 — State whether a UI-worded acceptance criterion is satisfied at the API DTO or at the rendered screen
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: fase-3-compliance-ux-clinico
- evidence: COMP3-10 — .specs/features/fase-3-compliance-ux-clinico/spec.md:55 (specs)
- last seen: 2026-08-15T09:40:27Z

### L-005 — Um script que serve de gate precisa de teste próprio, com fixture e violação plantada — senão ele fica cego em silêncio e segue reportando OK
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `scripts` · harmful: 0
- features: still-void-v2-migration
- evidence: Sensor M8 — scripts/check-sv-adoption.sh; tests/scripts/check-sv-adoption.test.ts (scripts)
- last seen: 2026-08-22T21:21:54Z

### L-006 — Ao asserir sobre saída de linha de comando, exija o marcador de falha e a contagem, nunca só o rótulo da checagem, que costuma ser impresso nos dois estados
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `tests` · harmful: 0
- features: still-void-v2-migration
- evidence: Sensor M12 — tests/scripts/check-sv-adoption.test.ts:107 (tests)
- last seen: 2026-08-22T21:21:54Z

### L-007 — Ao exigir que um documento liste um item, diga se satisfaz com seção própria ou com menção no corpo — as duas leituras são válidas e o verificador não tem como escolher
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: still-void-v2-migration
- evidence: AC P1-3.3 — .specs/features/still-void-v2-migration/spec.md:103 (specs)
- last seen: 2026-08-22T21:21:54Z

### L-008 — useApiQuery guarda estado por componente e não tem cache compartilhado: dois componentes que consultam a mesma URL divergem depois de uma mutação — quem depende do mesmo dado precisa recebê-lo por prop de um pai único.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `src/app/**,src/lib/use-api-query.ts` · harmful: 0
- features: e2e-consentimento-verdes
- evidence: src/lib/use-api-query.ts:13 (src/app/**,src/lib/use-api-query.ts)
- last seen: 2026-08-22T22:14:58Z

### L-009 — Asserção de ausência (toHaveCount(0)) exige uma âncora de presença na mesma lista, senão passa por lista vazia e casa por engano com registro vizinho de descrição parecida.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `e2e/**` · harmful: 0
- features: e2e-consentimento-verdes
- evidence: e2e/faturamento.spec.ts:136 (e2e/**)
- last seen: 2026-08-22T22:14:58Z

### L-010 — Ao testar escape/sanitização, escolha a entrada negativa provando que o defeito realmente aparece sem a correção — 'Dr. Ana' vs 'DrXAna' não exercita o curinga (falta o espaço), e uma string com '|' vira alternação que casa trivialmente.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `tests` · harmful: 0
- features: auditoria-seguranca-dependencias
- evidence: tests/support/regexp.test.ts:M3 (tests)
- last seen: 2026-08-23T15:46:52Z

### L-012 — Se um comentário do código afirma que um detalhe de implementação importa (ex.: ler parts.raw em vez do template cozido), esse detalhe precisa de teste próprio — sem ele a mutação que o desfaz sobrevive e o comentário vira a única garantia.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `e2e/support,tests` · harmful: 0
- features: ruido-scanners-seguranca
- evidence: M3: parts.raw -> parts (e2e/support,tests)
- last seen: 2026-08-24T18:43:02Z

### L-013 — AC deve prescrever o resultado, não a solução: 'criar .semgrepignore' fixou uma solução apoiada em premissa não medida (o ignore default excluiria tests/) e a premissa era falsa; 'nenhuma decisão cita arquivo inexistente' teria sobrevivido à medição.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `.specs` · harmful: 0
- features: ruido-scanners-seguranca
- evidence: AC-003.1 (.specs)
- last seen: 2026-08-24T18:43:02Z

### L-014 — Antes de suprimir falso positivo por arquivo de config no repositório, prove por A/B que o canal alcança o scanner que reporta: gitleaks e semgrep dão precedência a --config sobre o arquivo do repo, então serviço hospedado ignora a allowlist e só o comentário inline (gitleaks:allow / nosemgrep) sobrevive.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `configuração de scanners` · harmful: 0
- features: ruido-scanners-seguranca
- evidence: AD-011 (configuração de scanners)
- last seen: 2026-08-24T18:43:02Z

### L-015 — Contagem maior num scan novo não é regressão: confira duplicação antes de investigar — o scan de 2026-08-23 subiu de 35 para 54 findings apenas repetindo detect-non-literal-regexp (18 contados como 36) e um CVE do brace-expansion duas vezes, e ainda listava dois achados já corrigidos.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `processo de auditoria` · harmful: 0
- features: ruido-scanners-seguranca
- evidence: B8/B3 (processo de auditoria)
- last seen: 2026-08-24T18:43:02Z

### L-016 — Procedimento documentado só conta como verificado depois de executado verbatim: o README trazia 'gitleaks dir /tmp/scan' com alvo absoluto duas linhas acima do aviso de que o alvo tem de ser relativo, e um 'tar -x -C' em diretório inexistente — nenhum dos dois sobreviveria a uma execução, e o AC foi marcado como atendido só por leitura.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `docs,README` · harmful: 0
- features: ruido-scanners-seguranca
- evidence: AC-004.1 (docs,README)
- last seen: 2026-08-24T19:16:17Z

### L-017 — For every P1 acceptance criterion covering a shared layout component (Header, nav, layout wrapper), add an explicit test asserting that behavior directly — do not assume other pages that import the layout give it implicit coverage.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: still-void-v3-migration
- evidence: spec.md SV3-03 P1 AC4 / src/app/portal/layout.tsx:8-18 (testing)
- last seen: 2026-08-26T01:21:24Z

### L-018 — When a library derives a shared DOM attribute (e.g. radio name) from React.Children.map over direct children, assert that attribute directly on the rendered element in addition to app-level controlled-state behavior, since state-driven exclusivity tests can pass even when the library's direct-child contract is silently broken.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `still-void-ui` · harmful: 0
- features: still-void-v3-migration
- evidence: care-plans-section.tsx:638-649 mutation #1 (RadioGroupItem nested in wrapper div) (still-void-ui)
- last seen: 2026-08-26T01:21:24Z

### L-019 — Print/document pages that apply a neutral color override for print output need their own test or static check asserting the override classes are present, because routes with zero test/e2e coverage let color-override regressions ship silently.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `documentos` · harmful: 0
- features: still-void-v3-migration
- evidence: src/app/documentos/plano-cuidados/[carePlanId]/page.tsx:92 mutation #2 (removed text-black override) (documentos)
- last seen: 2026-08-26T01:21:24Z

### L-020 — When a spec requires zero elements with a given accessible name, assert via queryByRole/queryByLabelText (accessible name), not queryByText (text content), since the two diverge once markup changes even when equivalent today.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: still-void-v3-migration
- evidence: spec.md SV3-02 AC2 / tests/components/modal.test.tsx:46 (testing)
- last seen: 2026-08-26T01:21:24Z

### L-021 — Before accepting a spec AC as describing a migration regression, confirm the described pre-migration behavior actually existed in the code/history — a spec can assert a behavior (e.g. nav items) that never existed in the app, making the AC itself imprecise rather than the implementation regressed
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: still-void-v3-migration
- evidence: spec.md SV3-03 AC4 vs src/app/portal/layout.tsx history (commits 161f074, f14dec5, untouched by c30c632..7a3e385) (specs)
- last seen: 2026-08-26T02:04:06Z

### L-022 — In jsdom, a file input's .value getter reads as empty string regardless of whether code resets it after upload, so expect(input.value).toBe('') never discriminates a missing reset — assert the reset via a change handler spy or accept the behavior as untestable in jsdom and document it
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: still-void-v3-migration
- evidence: consent-card.tsx:162 mutation (removed e.target.value = "") — tests/pages/portal.test.tsx:930 expect(input.value).toBe("") still passed (testing)
- last seen: 2026-08-26T02:04:06Z

### L-023 — When adding toast-text test coverage for a binary toggle handler (e.g. toggleActive), the 'off'/deactivate branch tends to get covered first and the 'on'/reactivate branch is silently skipped — happened twice in one fix commit across two different files (profissionais and parceiros); always add or extend both branches together, not just the one with an existing test to append to.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tests/pages/staff-operations.test.tsx` · harmful: 0
- features: still-void-v3.3-adoption
- evidence: tests/pages/staff-operations.test.tsx (profissionais.toggleActive, parceiros.toggleActive) (tests/pages/staff-operations.test.tsx)
- last seen: 2026-08-30T07:01:31Z

### L-024 — Antes de envolver um handleX(values) passado como onSubmit de um form filho em try/catch novo, confirme se o form já tem seu próprio catch ao redor de 'await onSubmit(values)' — senão o novo catch engole o erro antes do form mostrar ErrorAlert inline e manter o modal aberto.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `src/app/(staff)` · harmful: 0
- features: still-void-v3.3-adoption
- evidence: src/app/(staff)/agenda/page.tsx:141, src/app/(staff)/faturamento/page.tsx:137 (pré-fix) (src/app/(staff))
- last seen: 2026-08-30T07:13:52Z

### L-025 — SidebarProvider da @still-void/ui tem defaultOpen=true (pensado pro rail de desktop, que ignora open); em qualquer app que usa o modo drawer/offcanvas em mobile, passe defaultOpen={false} explicitamente ou o drawer nasce aberto sem clique do usuário. Rode e2e com --repeat-each>=3 pra pegar flakes de timing de hidratação antes de considerar uma feature de layout responsivo fechada.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `src/app/(staff), still-void-ui SidebarProvider` · harmful: 0
- features: still-void-v3.3-adoption
- evidence: src/app/(staff)/staff-layout-client.tsx (pré-fix), e2e/sidebar-responsive.spec.ts flaky 2/3 repeats (src/app/(staff), still-void-ui SidebarProvider)
- last seen: 2026-08-30T07:13:58Z

### L-026 — Run the full lint gate and read its exit code, not its summary text, before declaring a feature done.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `gates` · harmful: 0
- features: autenticacao-nativa
- evidence: src/app/api/integrations/google-calendar/callback/route.ts:39 (gates)
- last seen: 2026-09-01T04:31:51Z

### L-027 — Every listed edge case needs its own test and its own line of implementation, even when another rule appears to make it unreachable.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `edge-cases` · harmful: 0
- features: autenticacao-nativa
- evidence: .specs/features/autenticacao-nativa/spec.md:147 (edge-cases)
- last seen: 2026-09-01T04:31:55Z

### L-028 — Do not write an acceptance criterion whose condition no code path can produce; make it verifiable or drop it.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: autenticacao-nativa
- evidence: .specs/features/autenticacao-nativa/spec.md:143 (spec)
- last seen: 2026-09-01T04:31:59Z

### L-029 — When a criterion says an operation is refused without a side effect, assert the absence of the side effect as well as the status code.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tests` · harmful: 0
- features: autenticacao-nativa
- evidence: tests/api/calendar-integration-routes.test.ts:174 (tests)
- last seen: 2026-09-01T04:32:08Z

### L-030 — When wrapping an existing destructive action in a confirmation dialog (ConfirmAction/AlertDialog), grep for and update every pre-existing e2e spec that clicks that action's trigger before treating the migration as done — unit tests that click-then-confirm can pass while old e2e specs that click-then-assert silently regress.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `e2e,confirm-action` · harmful: 0
- features: fase-a-padroes-estruturais
- evidence: e2e/equipe.spec.ts:28,71; e2e/pacientes.spec.ts:39; e2e/clinico.spec.ts:110; e2e/followup.spec.ts:24; e2e/plano-cuidados.spec.ts:125; e2e/triagem.spec.ts:38,64 (e2e,confirm-action)
- last seen: 2026-09-02T06:15:13Z

### L-031 — An AC phrase like 'com opção de tentar novamente via X' is a distinct, separately-testable requirement — don't let it get silently absorbed into a broader 'error UI is distinct from empty state' task without its own explicit done-when checkbox and test.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `spec-writing` · harmful: 0
- features: fase-a-padroes-estruturais
- evidence: spec.md FASEA-04 (Story 1, AC4) (spec-writing)
- last seen: 2026-09-02T06:15:13Z

### L-032 — When a spec AC is scoped at the page/file level ('toda mutação... nas páginas X'), don't let task execution silently narrow it to only the handlers named in the task's own prose — every mutation in that file is in scope unless the spec itself is amended.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `toast,scope-narrowing` · harmful: 0
- features: fase-a-padroes-estruturais
- evidence: src/app/(staff)/configuracoes/page.tsx:96-104,240-260; src/app/portal/consent-card.tsx:106-127 (toast,scope-narrowing)
- last seen: 2026-09-02T06:15:14Z

### L-033 — When a spec AC names a specific enum/variant value (e.g. toast variant='success' vs 'danger'), assert the rendered variant/class directly in tests, not just the message text — text-only assertions don't discriminate a variant swap.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing,toast` · harmful: 0
- features: fase-a-padroes-estruturais
- evidence: src/app/(staff)/pacientes/page.tsx:164 (variant swap) (testing,toast)
- last seen: 2026-09-02T06:15:14Z

### L-034 — When a page combines multiple useApiQuery results, guard '!resource' as not-found only after confirming the query actually settled (isLoading false or error set) — otherwise a still-loading resource is misread as not-found, as happened in the atestado page while clinic-info had already resolved.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `src/app/documentos` · harmful: 0
- features: fase-b-clinico-legal-critico
- evidence: CLIN-03 / spec.md:178 (src/app/documentos)
- last seen: 2026-09-02T10:28:04Z

### L-035 — When a task explicitly says to exercise a real credential/login flow (not a forged session token) for an E2E test, verify the diff actually does that — a session cookie minted directly proves route-guard/redirect behavior but not that the underlying login form/credentials path works, and no SPEC_DEVIATION was left to flag the shortcut.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `e2e` · harmful: 0
- features: fase-b-clinico-legal-critico
- evidence: CLIN-08 T16 tasks.md Done-when (e2e)
- last seen: 2026-09-02T10:28:04Z

### L-036 — When a spec's WHEN/THEN criterion for an audit or state-transition action doesn't pin the exact enum/action value, choose one, document the choice inline at the call site, and flag it explicitly in the validation report — do not let 'an event exists' stand in for the precise value.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `audit` · harmful: 0
- features: fase-c-lgpd-seguranca-dado
- evidence: AUDIT-03 / src/app/api/auth/logout/route.ts:13-19 (audit)
- last seen: 2026-09-02T16:06:55Z

### L-037 — When a spec edge case describes a repeated/duplicate action (double-click, retry) being idempotent, add a test that actually calls the action twice in sequence and asserts the final state — do not rely on the operation's construction being idempotent by inspection alone.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `consent` · harmful: 0
- features: fase-c-lgpd-seguranca-dado
- evidence: spec.md Edge Cases — dupla revogação idempotente / tests/api/portal-routes.test.ts (consent)
- last seen: 2026-09-02T16:07:00Z

### L-038 — When an AC requires a post-save side effect such as a refresh or refetch callback, assert the resulting refetch call or its observable effect explicitly, not just that the callback prop is wired in source
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `configuracoes,hooks,testing` · harmful: 0
- features: configuracoes-savable-form-seam
- evidence: CFG-SEAM-06 in .specs/features/configuracoes-savable-form-seam/validation.md (configuracoes,hooks,testing)
- last seen: 2026-09-06T23:29:19Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
