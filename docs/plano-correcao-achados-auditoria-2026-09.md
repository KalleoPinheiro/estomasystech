---
title: "Plano de Correção — Achados de Auditoria (Setembro 2026)"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# Plano de Correção — Achados de Auditoria (Setembro 2026)

- **Versão:** 1.0
- **Data:** 2026-09-02
- **Origem:** varredura de todos os docs do projeto (ADRs, auditorias de UX/design-system/segurança,
  `plano-evolucao-faseado.md`, PRDs de fase, `.specs/STATE.md`, `.specs/LESSONS.md`) cruzada com o
  rastreador de issues, pra achar gap/melhoria/dívida técnica ainda sem execução nem ticket.
- **Método:** cada item abaixo já é uma issue no GitHub (criadas nesta triagem, `needs-triage` ou
  `ready-for-agent` conforme o quanto o escopo já está fechado). Execução segue o padrão
  spec-driven (tlc-spec-driven) já usado nas fases anteriores — issue maior vira `.specs/features/`
  quando o escopo exigir.
- **Não é uma PRD de fase:** nenhum item aqui envolve decisão de produto/negócio nova (preço, o que
  um papel pode fazer, trade-off que só o usuário decide) — é triagem técnica de achado já
  documentado em auditoria. Ver `docs/agents/planning.md`, "When a phase does NOT get a PRD".

---

## Princípios de priorização

1. **Padrão estrutural antes de achado pontual** — a própria auditoria UX aponta 4 padrões
   recorrentes (contrato de erro, shell responsivo, confirmação destrutiva, feedback de escrita)
   como causa-raiz de dezenas de achados espalhados por 9 superfícies. Corrigir a causa uma vez
   evita reescrever o mesmo fix tela por tela.
2. **Falsidade documental e nulidade jurídica antes do resto** — atestado com status errado e
   documento sem responsável técnico são os únicos achados com risco jurídico direto e imediato.
3. **Vazamento de dado sensível antes de melhoria de conformidade** — nota clínica vazando pro
   portal é incidente ativo; consentimento mal versionado é dívida de conformidade, grave mas não
   um vazamento em curso.
4. **Número errado exibido com confiança** é pior que número ausente — por isso o KPI de
   faturamento vem antes da leva de infra.
5. **Infra/escala por último** — rate limit distribuído, paginação por cursor e CSP nonce só viram
   crítico com volume ou múltiplas réplicas; nenhum é bloqueante hoje.

## Visão geral das fases

| Fase | Nome | Issues | Status |
|------|------|--------|--------|
| A | Padrões estruturais (causa-raiz) | [#57](https://github.com/KalleoPinheiro/vitta-flow/issues/57)–[#60](https://github.com/KalleoPinheiro/vitta-flow/issues/60) | Backlog |
| B | Clínico/legal crítico | [#61](https://github.com/KalleoPinheiro/vitta-flow/issues/61)–[#68](https://github.com/KalleoPinheiro/vitta-flow/issues/68) | Backlog |
| C | LGPD / segurança de dado | [#69](https://github.com/KalleoPinheiro/vitta-flow/issues/69)–[#72](https://github.com/KalleoPinheiro/vitta-flow/issues/72) | Backlog |
| D | Precisão financeira | [#73](https://github.com/KalleoPinheiro/vitta-flow/issues/73) | Backlog |
| E | Infra / escala | [#74](https://github.com/KalleoPinheiro/vitta-flow/issues/74)–[#77](https://github.com/KalleoPinheiro/vitta-flow/issues/77) | Backlog |

---

## Fase A — Padrões estruturais (causa-raiz)

| Issue | Item | Origem | Label |
|------|------|--------|-------|
| [#57](https://github.com/KalleoPinheiro/vitta-flow/issues/57) | Contrato de erro de 3 estados do `useApiQuery` em todas as páginas | `auditoria-ux-2026-08.md` (padrão 3); `LESSONS.md` L-008 | needs-triage |
| [#58](https://github.com/KalleoPinheiro/vitta-flow/issues/58) | Shell responsivo mobile (sidebar off-canvas) | `auditoria-ux-2026-08.md` (padrão 1); `auditoria-design-system-2026-08.md` gap #1 | needs-triage |
| [#59](https://github.com/KalleoPinheiro/vitta-flow/issues/59) | `AlertDialog` em toda ação destrutiva/irreversível | `auditoria-ux-2026-08.md` (padrão 2); adoção pendente do `@still-void/ui` | needs-triage |
| [#60](https://github.com/KalleoPinheiro/vitta-flow/issues/60) | Feedback de sucesso (toast/inline) após toda escrita | `auditoria-ux-2026-08.md` (padrão 4) | needs-triage |

**Por que primeiro:** a auditoria recomenda explicitamente resolver esses 4 padrões antes de triar
os achados P1–P3 pontuais por tela — a maioria decorre diretamente daqui.

## Fase B — Clínico/legal crítico

| Issue | Item | Origem | Label |
|------|------|--------|-------|
| [#61](https://github.com/KalleoPinheiro/vitta-flow/issues/61) | UI de configuração de dados da clínica (nome, CNPJ, responsável técnico) | `auditoria-ux-2026-08.md` §Configurações (P0-10) | ready-for-agent |
| [#62](https://github.com/KalleoPinheiro/vitta-flow/issues/62) | Documentos clínicos emitidos sem responsável técnico/CNPJ | idem, §Documentos — depende de #61 | ready-for-agent |
| [#63](https://github.com/KalleoPinheiro/vitta-flow/issues/63) | Atestado imprime "compareceu" para consulta cancelada/falta | §Documentos | ready-for-agent |
| [#64](https://github.com/KalleoPinheiro/vitta-flow/issues/64) | Seletor de profissional permite assinar nota em nome de outrem | §Prontuário (P1-R12) | ready-for-agent |
| [#65](https://github.com/KalleoPinheiro/vitta-flow/issues/65) | Prontuário: erro de API renderiza como "sem dado clínico" | §Prontuário (P0-R1) — depende de #57 | needs-triage |
| [#66](https://github.com/KalleoPinheiro/vitta-flow/issues/66) | Prontuário: trocar de aba descarta SOAP/anamnese não salvos | §Prontuário (P0-R2) | ready-for-agent |
| [#67](https://github.com/KalleoPinheiro/vitta-flow/issues/67) | Prontuário: complicações de estomia gravadas nunca exibidas | §Prontuário (P0-R3) | ready-for-agent |
| [#68](https://github.com/KalleoPinheiro/vitta-flow/issues/68) | Login barra paciente/parceiro com subtítulo "restrito à equipe" | §Login (P0) | ready-for-agent |

## Fase C — LGPD / segurança de dado

| Issue | Item | Origem | Label |
|------|------|--------|-------|
| [#69](https://github.com/KalleoPinheiro/vitta-flow/issues/69) | Portal vaza notas clínicas internas | `auditoria-ux-2026-08.md` §Portal | ready-for-agent |
| [#70](https://github.com/KalleoPinheiro/vitta-flow/issues/70) | Consentimento LGPD no portal ilegível, sem versão, sem revogação | §Portal — art. 8º LGPD | needs-triage |
| [#71](https://github.com/KalleoPinheiro/vitta-flow/issues/71) | Trilha de auditoria: buracos de cobertura (login, criar paciente, config) | §Admin; `analise-seguranca-escalabilidade.md` §1.7 — art. 11 LGPD | needs-triage |
| [#72](https://github.com/KalleoPinheiro/vitta-flow/issues/72) | Criptografia em repouso para campos clínicos sensíveis | `analise-seguranca-escalabilidade.md` §1.7 | needs-triage |

## Fase D — Precisão financeira

| Issue | Item | Origem | Label |
|------|------|--------|-------|
| [#73](https://github.com/KalleoPinheiro/vitta-flow/issues/73) | KPIs de faturamento somados no cliente sobre página filtrada | `auditoria-ux-2026-08.md` §Financeiro | ready-for-agent |

## Fase E — Infra / escala

| Issue | Item | Origem | Label |
|------|------|--------|-------|
| [#74](https://github.com/KalleoPinheiro/vitta-flow/issues/74) | `google_accounts` sem `clinic_id` — última conexão vence para todas as empresas | `.specs/STATE.md`, handoff `autenticacao-nativa` | needs-triage |
| [#75](https://github.com/KalleoPinheiro/vitta-flow/issues/75) | Paginação por cursor nas listagens (API + UI) | `analise-seguranca-escalabilidade.md` §2.4; `plano-evolucao-faseado.md` Fase 6 | needs-triage |
| [#76](https://github.com/KalleoPinheiro/vitta-flow/issues/76) | CSP estrita com nonce | `analise-seguranca-escalabilidade.md` §1.5/1.7 | ready-for-agent |
| [#77](https://github.com/KalleoPinheiro/vitta-flow/issues/77) | Rate limit distribuído (Redis) para múltiplas réplicas | ADR-002 §Consequências; `analise-seguranca-escalabilidade.md` §1.7/2.4 | needs-triage |

---

## Achados descartados deliberadamente (não viraram issue)

| Item | Motivo |
|------|--------|
| RLS completo do Postgres (ADR-001 Fase 2) | Épico grande, precisa spec própria — adiado desde a Fase 6 |
| Onboarding self-service, billing, domínio custom (ADR-001 Fase 3) | Decisão de negócio, trava AD-003 |
| Dado agregado anonimizado/benchmark (ADR-001 Fase 4) | Decisão de produto futura |
| Monetização (Fase 5), TISS/convênios (Fase 6) | Decisão de negócio pendente, já registrada em `plano-evolucao-faseado.md` |
| 2FA (TOTP), assinatura digital ICP-Brasil | P2 sem pressão de compliance imediata / feature grande, precisa PRD próprio |
| Outbox/fila para eventos de calendário, cache HTTP/ETag em relatórios, unit-of-work entre agregados | P2, sem bug ativo hoje |
| `migrate` como job de deploy | Já resolvido — configurável via `VITTA_MIGRATE_ON_BOOT` |
| Dark mode, `CardSkeleton` flexível | Feature de produto / sem caso concreto reportado |
| 13 gaps de componente do `@still-void/ui` (design-system audit) | Pertencem ao repositório `still-void`, não ao `vitta-flow` |
| Adoção de `Tabs`/`Tooltip`/`DropdownMenu`/`Prose`/`ThemeToggle` | Baixo risco, sem urgência clínica ou de compliance |
| Dezenas de achados P1–P3 pontuais da auditoria UX | Ficam registrados no próprio `auditoria-ux-2026-08.md`, a triar depois que a Fase A fechar (recomendação da própria auditoria) |

---

## Critérios de conclusão por fase

Uma fase só é considerada entregue quando: (1) toda issue da fase tem PR mergeado referenciando-a
(`Closes #N`); (2) gates verdes (`npm run typecheck`, `npm run lint`, `npm run test:coverage`,
`npm run check:sv`, `npm run build`); (3) para issues que viraram `.specs/features/`, o Verifier
independente reporta PASS em `validation.md`.
