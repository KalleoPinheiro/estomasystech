# EstomaSysTech

Sistema de gestão clínica para **estomaterapia**: prontuário eletrônico (anamnese, evolução SOAP,
acompanhamento seriado de estomias e feridas com fotos), agenda com regras de horário e lista de
espera, faturamento com pagamentos parciais e repasse ao profissional, estoque de insumos, portal
do paciente e do parceiro, lembretes por e-mail e relatórios gerenciais. Multiempresa, com
autenticação nativa e autorização que falha fechado.

## Comece por aqui

| Você é… | Leia |
| --- | --- |
| dev chegando agora | [Onboarding técnico](docs/engineering/onboarding.md) → [Arquitetura](docs/engineering/architecture.md) → [Convenções](docs/engineering/conventions.md) |
| agente de IA (Cursor, Copilot, Claude, Codex…) | [`AGENTS.md`](AGENTS.md) — fonte única de instruções e mapa de contexto |
| produto / stakeholder | [Visão de produto](docs/product/visao-produto.md) → [Roadmap](docs/plano-evolucao-faseado.md#roadmap) |
| quem vai mexer num domínio | [`docs/domains/`](docs/domains/) — um README por domínio de negócio |
| quem vai escrever documentação | [Governança de docs](docs/governance.md) e [templates](docs/templates/) |

Índice completo: [`docs/README.md`](docs/README.md). Glossário do domínio: [`CONTEXT.md`](CONTEXT.md).

## Rodar em 5 minutos

Pré-requisito: Docker + Docker Compose.

```bash
cp .env.example .env
# preencha no mínimo AUTH_SECRET e ESTOMASYSTECH_BOOTSTRAP_TOKEN (RESEND_API_KEY e EMAIL_FROM: opcionais em dev, necessárias em produção)
docker compose up -d --build

until curl -sf http://localhost:3000/api/auth/providers >/dev/null; do sleep 2; done
set -a; . ./.env; set +a
curl -sX POST http://localhost:3000/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: $ESTOMASYSTECH_BOOTSTRAP_TOKEN" \
  -d '{"email":"voce@suaclinica.com"}'
# abra o link do convite (ou o `inviteUrl` da resposta, se `delivered` vier false)
```

App em http://localhost:3000. Desenvolvimento com hot reload, todas as variáveis de ambiente e
as integrações opcionais: [onboarding](docs/engineering/onboarding.md). Deu erro?
[Troubleshooting](docs/engineering/troubleshooting.md).

## Domínios

| Domínio | O que cobre |
| --- | --- |
| [Acesso](docs/domains/acesso/README.md) | login, convite, seis papéis, empresas, auditoria, LGPD |
| [Pacientes e prontuário](docs/domains/pacientes-prontuario/README.md) | cadastro, anamnese, SOAP, condições, fotos, planos de cuidado, documentos |
| [Agenda](docs/domains/agenda/README.md) | consultas, grade, feriados, lista de espera, recall, procedimentos |
| [Financeiro](docs/domains/financeiro/README.md) | faturas, pagamentos parciais, pacotes, comissão, repasses |
| [Estoque](docs/domains/estoque/README.md) | insumos, lotes, movimentações, kits |
| [Portal](docs/domains/portal/README.md) | área do paciente e do parceiro |
| [Equipe e parceiros](docs/domains/equipe-parceiros/README.md) | profissionais, horários, parceiros que indicam |
| [Comunicação](docs/domains/comunicacao/README.md) | lembretes automáticos por e-mail, botão de WhatsApp (`wa.me`) e e-mails de acesso |
| [Relatórios](docs/domains/relatorios/README.md) | dashboard e relatório gerencial |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript estrito · PostgreSQL 16 + Drizzle ORM (PGlite nos
testes) · Tailwind CSS 4 + [`@still-void/ui`](docs/still-void-gaps.md) · Zod · Vitest + Playwright ·
Biome · Docker Compose.

## Qualidade

```bash
npm run typecheck && npm run lint && npm run check:sv && npm run check:docs && npm run test:coverage
npm run test:e2e
```

Cobertura mínima de 90% imposta no CI. Níveis de teste e padrões: [convenções](docs/engineering/conventions.md).
Varredura de segurança sob demanda: [security-scan](docs/engineering/security-scan.md). API: [api.md](docs/engineering/api.md).

## Licença

Ver [LICENSE](LICENSE).
