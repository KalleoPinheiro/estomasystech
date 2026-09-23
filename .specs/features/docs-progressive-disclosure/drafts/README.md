# Rascunhos — Documentação em Progressive Disclosure

Arquivos prontos para uso, **ainda fora do lugar definitivo** até o [`plan.md`](../plan.md) ser
aprovado. Cada um diz no topo para onde vai.

| Rascunho | Destino | Entrega (pedido) |
| --- | --- | --- |
| [`AGENTS.md`](AGENTS.md) | `/AGENTS.md` (substitui o atual) | 2 — SSOT global / system prompt |
| [`templates/feature-spec.md`](templates/feature-spec.md) | `docs/templates/feature-spec.md` | 1 — especificação de funcionalidade (RN, UC, fluxo de valor, Gherkin) |
| [`templates/domain.md`](templates/domain.md) | `docs/templates/domain.md` | 1 — L1 de cada domínio |
| [`templates/integration.md`](templates/integration.md) | `docs/templates/integration.md` | 1 — guia de integração |
| [`engineering/onboarding.md`](engineering/onboarding.md) | `docs/engineering/onboarding.md` (substitui `docs/setup-local.md`) | 1 — onboarding/setup local e Docker |
| [`engineering/integrations-README.md`](engineering/integrations-README.md) | `docs/engineering/integrations/README.md` | 1 — índice de integrações |
| [`engineering/troubleshooting.md`](engineering/troubleshooting.md) | `docs/engineering/troubleshooting.md` | 1 — troubleshooting |
| [`roadmap.md`](roadmap.md) | topo de `docs/plano-evolucao-faseado.md` | 3 — roadmap + contrato com GitHub Projects/Jira/Linear/Notion |
| [`governance.md`](governance.md) | `docs/governance.md` | 4 — docs-as-code, contexto para LLM, progressive disclosure |

## Estrutura-alvo

```text
/
├── AGENTS.md                      L0  SSOT: produto, comandos, regras, mapa (≤150 linhas)
├── CLAUDE.md                          @AGENTS.md
├── CONTEXT.md                     L1  glossário de domínio (inalterado)
├── README.md                          vitrine humana ≤120 linhas → links
├── .github/copilot-instructions.md    ponte → AGENTS.md
├── .cursor/rules/*.mdc                pontes com globs → docs
├── .specs/                        L3  execução (inalterado) + archive/ para handoffs concluídos
└── docs/
    ├── README.md                  L1  índice de tudo em docs/
    ├── governance.md                  regras deste sistema de docs
    ├── plano-evolucao-faseado.md      roadmap (caminho mantido)
    ├── product/                       visão, objetivos, personas, PRDs por fase
    │   └── visao-produto.md           (novo)
    ├── domains/                   L1/L2  um por domínio de negócio
    │   ├── acesso/                    auth, empresas, papéis, auditoria
    │   ├── pacientes-prontuario/
    │   ├── agenda/
    │   ├── financeiro/
    │   ├── estoque/
    │   ├── portal/
    │   ├── equipe-parceiros/
    │   ├── comunicacao/
    │   └── relatorios/
    │       ├── README.md              resumo, regras, funcionalidades, código, decisões
    │       └── features/<slug>.md     spec funcional viva (template feature-spec)
    ├── engineering/               L2  transversal técnico
    │   ├── onboarding.md              (era setup-local.md)
    │   ├── architecture.md            (sai do README)
    │   ├── conventions.md             (Biome, testes, tenant scope, sv)
    │   ├── troubleshooting.md
    │   └── integrations/{README,resend,google-calendar,whatsapp-meta,s3-storage,cron}.md
    ├── adr/                       L2  inalterado
    ├── audits/                    L3  congelado
    ├── agents/                        inalterado
    ├── templates/                     feature-spec, domain, integration, prd, adr
    ├── still-void-gaps.md             caminho mantido (check:sv depende)
    └── backlog-design-system.md
```
