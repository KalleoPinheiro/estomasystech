---
title: "ADR 003 — Modelo de papéis (RBAC) multi-empresa"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# ADR 003 — Modelo de papéis (RBAC) multi-empresa

- **Status:** Aceito (implementação incremental futura)
- **Data:** 2026-08-30
- **Contexto:** reforma do sistema de login/autorização, ver [CONTEXT.md](../../CONTEXT.md) § Access Control

## Contexto

O modelo atual tem só 3 papéis: `admin`, `partner`, `patient`
(`src/domain/auth/user-role.ts`). Na prática, `admin` é monolítico — qualquer
conta de equipe (atendente, profissional, gestor) tem acesso total a todos os
dados de todos os pacientes. A ADR-002 já registrava essa lacuna como risco
residual: "autorização por escopo de paciente dentro do papel admin: hoje
qualquer conta de equipe lê qualquer paciente. Exige mudança no modelo de
papéis."

Além disso, a ADR-001 decidiu a estratégia de multi-tenancy (`clinic_id` +
RLS), o que introduz uma distinção que o modelo atual não tem: um admin
*daquela empresa* (clínica) é diferente de um admin *do sistema como um todo*
(cross-empresa).

## Opções consideradas

| Opção | Prós | Contras |
|---|---|---|
| **A. Catálogo fixo de 6 papéis** | Simples de raciocinar; sem superfície de customização por empresa para dar errado; resolve a lacuna da ADR-002 com escopo dinâmico para Profissional | Empresa não pode inventar papel próprio; se um cliente pedir um papel novo, é mudança de código |
| B. RBAC granular customizável por empresa (permissões configuráveis, tipo Notion/Slack) | Flexível para qualquer necessidade futura de cliente | Muito mais complexo de implementar e testar agora; não há demanda concreta hoje que justifique |
| C. Manter os 3 papéis atuais, só adicionar `clinic_id` ao admin | Menor mudança de código | Não resolve o problema original (admin monolítico); atendente e profissional continuariam sem diferenciação |

## Decisão

**Opção A — catálogo fechado de seis papéis**: Super Admin, Admin de Empresa,
Atendente, Profissional, Patient, Partner. Detalhes de escopo de cada um estão
em [CONTEXT.md](../../CONTEXT.md) § Role — não duplicados aqui.

Pontos centrais da decisão:

- **Escopo por empresa**: todo papel exceto Super Admin é limitado à própria
  Clinic (`clinic_id`). Super Admin é cross-empresa por definição, com todo
  acesso a dado de empresa alheia auditado.
- **Escopo dinâmico para Profissional**: acesso a um paciente vem de ter pelo
  menos um agendamento ou nota de evolução com ele — não de um campo estático
  de "dono". Aproveita o schema já existente (agendamento já tem profissional
  designado) e permite cobertura/transferência de caso sem reatribuição
  manual.
- **Hierarquia de provisionamento fixa**: nenhum papel se auto-cadastra; quem
  cadastra quem está fixado no catálogo (ver CONTEXT.md § Account
  provisioning), não é configurável por empresa.

## Consequências

**Positivas**

- Fecha a lacuna registrada na ADR-002: atendente e profissional deixam de ter
  o mesmo acesso total que hoje só existia sob o nome genérico de "admin".
- Superfície de dado sensível exposta por padrão diminui (atendente não vê
  dado clínico).
- Modelo permanece simples de auditar: seis papéis, regras fixas, sem matriz
  de permissões configurável para divergir por empresa.

**Negativas / custos aceitos**

- Sem customização por empresa. Se um cliente precisar de um papel diferente
  do catálogo, é mudança de código, não de configuração — aceito
  conscientemente para não construir um RBAC genérico sem demanda comprovada.
- O escopo dinâmico do Profissional exige que toda leitura de paciente por
  esse papel passe por uma verificação de vínculo (agendamento ou nota de
  evolução), em vez de um filtro simples por coluna — mais pontos de código a
  ajustar do que um campo de "dono" estático teria exigido.
- Contas existentes (hoje todas `admin`) precisam de remapeamento manual para
  o papel real na migração — não há como inferir automaticamente se uma conta
  hoje "admin" deveria virar Admin de Empresa, Atendente ou Profissional.

## Relacionado

- [ADR-001: Multi-tenancy strategy](./001-multi-tenancy.md) — fornece o
  `clinic_id` que delimita o escopo de todos os papéis exceto Super Admin.
- [ADR-002: Two-layer authorization](./002-autorizacao-em-duas-camadas.md) —
  registrava a lacuna que esta ADR resolve.
- [ADR-004: Remoção do Google OAuth como autenticação](./004-remocao-google-oauth-autenticacao.md)
  — muda como a sessão é estabelecida; este documento define o que ela carrega.
