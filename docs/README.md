---
title: "Índice de docs/"
status: living
audience: [dev, po, stakeholder, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-11
---

# docs/

> **Como ler:** [`../AGENTS.md`](../AGENTS.md) (L0) aponta para um domínio ou guia; cada um abre
> com um resumo e desce por links. Este índice lista **todo** arquivo de `docs/` — `npm run
> check:docs` garante que os links resolvem. Regras do sistema: [`governance.md`](governance.md).

## Produto e planejamento

| Arquivo | Status | Para quê |
| --- | --- | --- |
| [`product/visao-produto.md`](product/visao-produto.md) | living | visão, personas, objetivos de negócio |
| [`plano-evolucao-faseado.md`](plano-evolucao-faseado.md) | living | **roadmap** (Now/Next/Later, `RM-NN`) e detalhe por fase |
| [`product/prd-fase-1.md`](product/prd-fase-1.md) | frozen | PRD do módulo clínico |
| [`product/prd-fase-2.md`](product/prd-fase-2.md) | frozen | PRD da fase 2 |
| [`product/prd-fase-3.md`](product/prd-fase-3.md) | frozen | PRD da fase 3 |
| [`product/prd-fase-6.md`](product/prd-fase-6.md) | living | PRD da plataforma (RBAC, multiempresa, auth) |
| [`plano-correcao-achados-auditoria-2026-09.md`](plano-correcao-achados-auditoria-2026-09.md) | frozen | plano dos achados de auditoria #57–#77 |

## Domínios de negócio

| Domínio | Cobre |
| --- | --- |
| [`domains/acesso/`](domains/acesso/README.md) | login, papéis, empresas, auditoria |
| [`domains/pacientes-prontuario/`](domains/pacientes-prontuario/README.md) | paciente e prontuário |
| [`domains/agenda/`](domains/agenda/README.md) | consultas, grade, lista de espera, recall |
| [`domains/financeiro/`](domains/financeiro/README.md) | faturas, pacotes, comissão, repasses |
| [`domains/estoque/`](domains/estoque/README.md) | insumos e movimentações |
| [`domains/portal/`](domains/portal/README.md) | portal do paciente e do parceiro |
| [`domains/equipe-parceiros/`](domains/equipe-parceiros/README.md) | profissionais e parceiros |
| [`domains/comunicacao/`](domains/comunicacao/README.md) | lembretes e e-mails |
| [`domains/relatorios/`](domains/relatorios/README.md) | dashboard e relatório gerencial |

Specs funcionais vivas ficam em `domains/<slug>/features/` e são linkadas pelo README do domínio.

## Engenharia

| Arquivo | Para quê |
| --- | --- |
| [`engineering/onboarding.md`](engineering/onboarding.md) | requisitos, Docker, Node local, **variáveis de ambiente**, testes, gates |
| [`engineering/producao.md`](engineering/producao.md) | **runbook de produção**: VPS Hetzner + compose + Caddy, TLS, backup/restore cifrado, segredos e rotação, migrações, cron, alertas |
| [`engineering/architecture.md`](engineering/architecture.md) | camadas, fluxo de requisição, decisões transversais |
| [`engineering/conventions.md`](engineering/conventions.md) | Biome, UI, escopo de dados, níveis de teste, commits |
| [`engineering/api.md`](engineering/api.md) | rotas REST centrais |
| [`engineering/troubleshooting.md`](engineering/troubleshooting.md) | sintoma → causa → ação |
| [`engineering/security-scan.md`](engineering/security-scan.md) | npm audit, gitleaks, semgrep |
| [`engineering/integrations/README.md`](engineering/integrations/README.md) | índice das integrações externas |
| [`engineering/integrations/resend.md`](engineering/integrations/resend.md) | e-mail transacional |
| [`engineering/integrations/google-calendar.md`](engineering/integrations/google-calendar.md) | sincronização de agenda |
| [`engineering/integrations/whatsapp-meta.md`](engineering/integrations/whatsapp-meta.md) | lembretes por WhatsApp |
| [`engineering/integrations/s3-storage.md`](engineering/integrations/s3-storage.md) | fotos em bucket S3-compatível |
| [`engineering/integrations/cron.md`](engineering/integrations/cron.md) | disparo externo dos lembretes |
| [`engineering/integrations/retencao.md`](engineering/integrations/retencao.md) | disparo externo da retenção e anonimização (#294) |
| [`engineering/integrations/alertas.md`](engineering/integrations/alertas.md) | cron de alertas por e-mail ao operador (#212) |
| [`engineering/integrations/glitchtip.md`](engineering/integrations/glitchtip.md) | error tracking self-hosted sem dado pessoal (#212) |

## Decisões

| Arquivo | Decisão |
| --- | --- |
| [`adr/001-multi-tenancy.md`](adr/001-multi-tenancy.md) | multiempresa por `clinic_id`, RLS adiada |
| [`adr/002-autorizacao-em-duas-camadas.md`](adr/002-autorizacao-em-duas-camadas.md) | proxy + handler, fail-closed |
| [`adr/003-modelo-de-papeis-multi-empresa.md`](adr/003-modelo-de-papeis-multi-empresa.md) | catálogo fechado de seis papéis |
| [`adr/004-remocao-google-oauth-autenticacao.md`](adr/004-remocao-google-oauth-autenticacao.md) | login nativo; Google só como integração |
| [`adr/005-revogacao-de-sessao-por-versao.md`](adr/005-revogacao-de-sessao-por-versao.md) | `session_version` revoga sessões (logout, senha, desativação) |
| [`adr/006-chave-de-dados-clinicos.md`](adr/006-chave-de-dados-clinicos.md) | `DATA_ENCRYPTION_KEY` versionada cifra o texto clínico |
| [`adr/007-super-admin-operador-da-plataforma.md`](adr/007-super-admin-operador-da-plataforma.md) | Super Admin único, só na família `platform`, sem dado de clínica |
| [`adr/008-segundo-fator-do-super-admin.md`](adr/008-segundo-fator-do-super-admin.md) | Super Admin entra com senha + TOTP; códigos de recuperação levam ao recadastro |
| [`adr/009-recuperacao-de-emergencia-do-super-admin.md`](adr/009-recuperacao-de-emergencia-do-super-admin.md) | Super Admin que perdeu tudo volta por `npm run admin:recover` no servidor |
| [`adr/010-trilha-de-auditoria-de-plataforma.md`](adr/010-trilha-de-auditoria-de-plataforma.md) | evento sem empresa é de plataforma (`clinic_id` nulo), visto só pelo Super Admin; auditoria escopada por empresa |
| [`adr/011-canal-de-comunicacao-por-clinica.md`](adr/011-canal-de-comunicacao-por-clinica.md) | e-mail de cada clínica sai pela chave dela (`clinic_channels`, cifrada); sem canal, não sai; chave da plataforma opcional e só para contas sem clínica |
| [`adr/012-segundo-fator-e-senha-da-equipe.md`](adr/012-segundo-fator-e-senha-da-equipe.md) | 2FA obrigatório também para o Admin de Empresa, opcional para Atendente/Profissional; senha da equipe com 10+ caracteres e fora da lista de senhas comuns |
| [`adr/013-retencao-por-anonimizacao.md`](adr/013-retencao-por-anonimizacao.md) | dado vencido é anonimizado (nunca excluído) por um job de cron; só o repositório de retenção reescreve a trilha de auditoria |
| [`adr/014-observabilidade-sem-pii.md`](adr/014-observabilidade-sem-pii.md) | logs JSON com request-id, GlitchTip self-hosted por evento montado pelo app (sem PII), health/ready e alertas por e-mail ao operador |
| [`adr/015-sessoes-do-admin-sem-2fa-e-senha-unica.md`](adr/015-sessoes-do-admin-sem-2fa-e-senha-unica.md) | sessões do Admin sem 2FA derrubadas pela migração 0052 e política de senha única (10 + lista) para equipe e portal |

Decisões de execução (não arquiteturais) ficam em `../.specs/STATE.md` — ver [`agents/planning.md`](agents/planning.md).

## Auditorias (snapshots congelados)

| Arquivo | Escopo |
| --- | --- |
| [`audits/analise-seguranca-escalabilidade.md`](audits/analise-seguranca-escalabilidade.md) | segurança e escalabilidade |
| [`audits/auditoria-ux-2026-08.md`](audits/auditoria-ux-2026-08.md) | UX, agosto 2026 |
| [`audits/auditoria-design-system-2026-08.md`](audits/auditoria-design-system-2026-08.md) | design system, agosto 2026 |

Auditoria é **entrada** de planejamento, nunca pedido de trabalho por si só.

## Design system

| Arquivo | Para quê |
| --- | --- |
| [`still-void-gaps.md`](still-void-gaps.md) | exceções `sv-gap` aceitas pelo `check:sv` (caminho fixo no script) |
| [`backlog-design-system.md`](backlog-design-system.md) | histórico e backlog da adoção de `@still-void/ui` |

## Como agentes consomem este repositório

| Arquivo | Para quê |
| --- | --- |
| [`governance.md`](governance.md) | progressive disclosure, docs-as-code, contexto para LLMs |
| [`agents/domain.md`](agents/domain.md) | glossário e ADRs |
| [`agents/planning.md`](agents/planning.md) | onde vive cada tipo de plano; os dois logs de decisão |
| [`agents/issue-tracker.md`](agents/issue-tracker.md) | issues no GitHub |
| [`agents/triage-labels.md`](agents/triage-labels.md) | labels de triagem |
| [`agents/fix-audit-issues.md`](agents/fix-audit-issues.md) | pipeline de correção de achados |

## Templates

| Template | Destino |
| --- | --- |
| [`templates/feature-spec.md`](templates/feature-spec.md) | `domains/<slug>/features/<funcionalidade>.md` |
| [`templates/domain.md`](templates/domain.md) | `domains/<slug>/README.md` |
| [`templates/integration.md`](templates/integration.md) | `engineering/integrations/<serviço>.md` |
| [`templates/prd.md`](templates/prd.md) | `product/prd-fase-N.md` |
| [`templates/adr.md`](templates/adr.md) | `adr/NNN-slug.md` |

Execução por feature (spec/design/tasks/validação, congelado) fica em `../.specs/features/`, não aqui.
