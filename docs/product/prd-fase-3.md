---
title: "PRD — EstomaSysTech Fase 3: De Sistema de Clínica a Plataforma de Estomaterapia"
status: frozen
audience: [po, stakeholder, dev]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# PRD — EstomaSysTech Fase 3: De Sistema de Clínica a Plataforma de Estomaterapia

- **Versão:** 1.0
- **Data:** 2026-07-18
- **Status:** Aprovado para implementação em 4 ondas
- **Antecessores:** [prd-fase-1.md](./prd-fase-1.md) (Fase 1), [prd-fase-2.md](./prd-fase-2.md) (Fase 2)

---

## 1. Visão

Tornar o EstomaSysTech **a referência de gestão para estomaterapia**. A tese: nenhum ERP
genérico entende a especialidade (scores de cicatrização, pele periestomal, recall
clínico, consumo de coberturas), e nenhum concorrente terá o dado longitudinal que o
EstomaSysTech acumula. As 4 ondas atacam, nesta ordem: **fundação de dados**, **profundidade
clínica**, **operação multi-profissional** e **virada de plataforma**.

Regra de execução: uma onda = uma branch a partir da `main` atualizada = um commit
mergeado na `main`. Cada onda termina com testes, lint e build verdes.

---

## Onda 1 — Fundação (`onda-1-fundacao`)

Corrige três raízes que corrompem dados e auditoria. Tudo depois depende delas.

### O1.1 — Catálogo de procedimentos

**Problema:** `appointment.procedure` é texto livre. "Troca de bolsa" ≠ "troca de bolsa"
→ margem por procedimento fragmenta, preço é redigitado a cada agendamento.

**Solução:** entidade `Procedure` (nome único, preço padrão em centavos, duração padrão
em minutos, ativo). Agendamento seleciona do catálogo; preço e duração autopreenchidos
(editáveis). O nome do procedimento continua desnormalizado na consulta (histórico
imune a renomeações), mas passa a vir de fonte consistente.

**Escopo:**
- Domínio `Procedure` + repositório (Drizzle/in-memory), migração.
- CRUD `/api/procedures` + página `/procedimentos` (staff).
- Form da agenda: select do catálogo → preenche procedimento/preço/duração; campo
  livre permanece como fallback quando o catálogo está vazio (migração suave).
- `appointments.procedure_id` (nullable — histórico intacto).

**Critérios de aceite:**
- Procedimento inativo não aparece no agendamento, mas histórico o exibe.
- Selecionar procedimento preenche preço (editável) e duração (recalcula fim).
- Nome único no catálogo (case-insensitive).

### O1.2 — Contas individuais e autoria real

**Problema:** `AUTH_PASSWORD` única → `audit_events.actorId = "staff"` não identifica a
pessoa. Autoria da evolução é um select manual (falsificável). LGPD/COFEN pedem
rastreabilidade individual.

**Solução:** contas de usuário com senha própria (scrypt), vinculáveis a um
profissional. Login por email+senha convive com a senha master (retrocompatível). A
sessão carrega a identidade; auditoria registra o email real; evolução assume como
autor o profissional da sessão (select vira read-only quando a sessão é individual).

**Escopo:**
- `user_accounts`: email único, hash scrypt+salt, professional_id nullable, ativo.
- `/api/auth/login` aceita `{password}` (master, como hoje) ou `{email, password}`.
- Sessão (`sub`) = email da conta; auditoria passa a registrar a pessoa.
- CRUD de contas em `/configuracoes` (staff) — criar conta para profissional.
- Evolução SOAP: autor default = profissional da sessão.

**Fora de escopo (documentado):** permissões por papel clínico (recepção sem SOAP) —
exige matriz de permissão; fica para onda futura.

**Critérios de aceite:**
- Login individual gera sessão com email; eventos de auditoria mostram o email.
- Senha armazenada com scrypt (custo padrão Node) + salt por conta; nunca em claro.
- Conta desativada não loga; senha master continua funcionando.

### O1.3 — Grade de horários configurável

**Problema:** seg–sex 8h–18h hardcoded em `business-hours.ts`. Clínica que atende
sábado não consegue usar o sistema.

**Solução:** configuração persistida (linha única `schedule_settings`): dias da semana
ativos, hora de abertura/fechamento, gap mínimo. Defaults = comportamento atual.
Validação de agendamento consome a configuração; UI de edição em `/configuracoes`.

**Critérios de aceite:**
- Sem configuração salva → regras atuais (compatibilidade total).
- Alterar grade reflete imediatamente na validação e no texto do form da agenda.
- Abertura ≥ 0, fechamento ≤ 24, abertura < fechamento, ≥ 1 dia ativo, gap 0–120min.

---

## Onda 2 — Profundidade clínica (`onda-2-clinica`)

Transforma anotações em desfecho mensurável e faz F3/F5/F8 renderem de fato.

### O2.1 — PUSH Score (feridas)

**Problema:** medimos C×L, exsudato e tecido, mas não calculamos o instrumento padrão
da especialidade. PUSH (Pressure Ulcer Scale for Healing 3.0) = subscore de área (0–10)
+ exsudato (0–3) + tipo de tecido (0–4) → total 0–17. Score em queda = prova objetiva
de cicatrização aceita por convênios e literatura.

**Solução:** cálculo derivado no domínio (sem campo novo obrigatório): área em cm² →
faixa PUSH; exsudato já é enum (none/low/moderate/high → 0/1/2/3); tipo de tecido vira
**enum** (fechado/epitelização/granulação/esfacelo/necrose → 0–4). Gráfico de
cicatrização ganha a série do PUSH; avaliação exibe o score.

**Escopo:**
- `tissueType` passa de texto livre a enum (valores legados preservados como texto;
  novos registros usam enum — select na UI).
- `ConditionAssessment.pushScore` (getter derivado; null quando faltam componentes).
- HealingChart plota PUSH; DTO expõe o score e os subscores.

**Critérios de aceite:**
- PUSH exato conforme tabela 3.0 (área: 0, <0.3, 0.3–0.6, 0.7–1.0, 1.1–2.0, 2.1–3.0,
  3.1–4.0, 4.1–8.0, 8.1–12.0, 12.1–24.0, >24 cm²).
- Avaliação sem C×L ou sem exsudato ou sem tecido → score null (nunca chuta).
- Registro legado com tecido em texto livre não quebra nada.

### O2.2 — Escala DET (estomias)

**Problema:** pele periestomal é texto livre; complicações idem. Sem dado estruturado
não há epidemiologia nem relatório sério para o parceiro.

**Solução:** avaliação de estomia ganha os 3 domínios DET (Discoloration, Erosion,
Tissue overgrowth), cada um = área afetada (0–3) + severidade (0–2) → total 0–15.
Complicações viram **multi-select de enum** (dermatite, prolapso, hérnia, retração,
sangramento, granuloma, estenose, outro) mantendo campo livre para observação.

**Critérios de aceite:**
- DET total = soma dos domínios; domínio sem preenchimento → score null.
- Complicações persistidas como lista canônica (CSV de enums); legado texto preservado.
- Gráfico da condição de estomia plota DET ao longo do tempo.

### O2.3 — Recall de 1 clique

**Problema:** follow-up vencido → recepção redigita agendamento inteiro.

**Solução:** ação "Agendar retorno" na pendência abre a agenda com paciente e
procedimento pré-preenchidos (query params); ao agendar a partir de um follow-up, ele é
marcado `scheduled` automaticamente.

**Critérios de aceite:**
- Fluxo completo em ≤ 2 cliques + escolha de horário.
- Follow-up só muda de status quando o agendamento é criado com sucesso.

### O2.4 — Kit de insumos por procedimento

**Problema:** vínculo consulta↔insumo é manual em outro módulo → ninguém faz, margem
fica vazia.

**Solução:** procedimento do catálogo (O1.1) declara kit (insumo + quantidade). Ao
**concluir** consulta com procedimento de kit, o sistema baixa o kit automaticamente
(saída vinculada à consulta, motivo "kit do procedimento"), respeitando estoque —
insuficiência não bloqueia a conclusão, gera aviso.

**Critérios de aceite:**
- Conclusão idempotente-reparadora não baixa kit duas vezes.
- Estoque insuficiente → consulta conclui, kit parcial não é baixado (tudo-ou-nada por
  item), aviso no retorno da API.
- Baixa aparece na margem do relatório (F3) sem ação manual.

---

## Onda 3 — Operação multi-profissional (`onda-3-operacao`)

Destrava a clínica com 2+ estomaterapeutas — o cliente que mais paga.

### O3.1 — Conflito de agenda por profissional

**Problema:** constraint é single-room: dois profissionais não atendem simultaneamente.

**Solução:** conflito passa a considerar o profissional: consultas de profissionais
**diferentes** podem coexistir no mesmo horário. Consulta sem profissional mantém a
regra global (conflita com tudo — default seguro). Constraint de exclusão do banco
refeita com `professional_id` no escopo; validação de aplicação (`findConflicting`)
recebe o profissional.

**Critérios de aceite:**
- Mesmo horário, profissionais distintos → agenda.
- Mesmo horário, mesmo profissional → bloqueia (com gap de 15min).
- Consulta sem profissional × qualquer outra → bloqueia (regra atual preservada).

### O3.2 — Série recorrente

**Problema:** tratamento de ferida é 1–2×/semana por meses; agendar um a um é fricção.

**Solução:** agendamento com repetição semanal (a cada N semanas, X ocorrências,
máx. 24). Cada ocorrência valida individualmente; conflitos são reportados e pulados —
resumo mostra criadas × puladas.

**Critérios de aceite:**
- Série cria só as ocorrências válidas; nenhuma falha aborta as demais.
- Resposta lista as datas puladas e o motivo.

### O3.3 — Pacotes de sessões

**Problema:** clínicas vendem "10 sessões de curativo" pré-pagas; sistema só fatura
por consulta.

**Solução:** `Package`: paciente + procedimento + nº de sessões + preço total. Venda do
pacote gera **uma** fatura (do pacote). Concluir consulta do procedimento coberto
consome 1 sessão do pacote ativo em vez de gerar fatura avulsa.

**Critérios de aceite:**
- Pacote com saldo → conclusão consome sessão e **não** gera fatura da consulta.
- Saldo zerado → volta a faturar avulso.
- Reexecução da conclusão (reparo) não consome sessão duas vezes.

### O3.4 — Produção e repasse por profissional

**Problema:** multi-profissional sem visão de produção nem repasse não fecha folha.

**Solução:** `commission_pct` opcional no profissional. Relatório mensal ganha seção de
produção: por profissional, consultas concluídas, receita gerada e repasse calculado
(receita × %).

**Critérios de aceite:**
- Consulta sem profissional entra em "sem atribuição".
- Repasse = soma(preço das concluídas) × pct vigente; pct null → produção sem repasse.

---

## Onda 4 — Plataforma (`onda-4-plataforma`)

### O4.1 — Consentimento digital

**Problema:** termo (F7) é impresso; aceite não fica registrado no sistema.

**Solução:** paciente aceita o termo no portal: registro imutável com hash SHA-256 do
texto aceito, data/hora e IP. Staff vê status do consentimento no prontuário; termo
impresso continua disponível.

**Critérios de aceite:**
- Registro guarda o hash do texto exato exibido no aceite (mudou o texto → novo aceite).
- Paciente vê o que aceitou e quando; staff vê pendência de consentimento.
- Aceite gera evento de auditoria.

### O4.2 — Monitoramento remoto de ferida

**Problema:** entre consultas a clínica não enxerga o paciente — e estomaterapia tem
forte componente domiciliar.

**Solução:** paciente envia foto da própria condição pelo portal (mesmo pipeline F6:
magic bytes, 5 MB, storage privado) com observação opcional. Staff tem fila de triagem:
pendente → avaliada ("ok, manter plano") ou "antecipar retorno" (cria follow-up
imediato).

**Critérios de aceite:**
- Foto do paciente é visualmente distinta das fotos clínicas (origem "paciente").
- Triagem "antecipar retorno" cria follow-up pendente com vencimento imediato.
- Parceiro nunca vê fotos (regra F6 mantida); paciente só envia para condição própria
  e ativa.

### O4.3 — Exportação de dados do titular (LGPD)

**Problema:** direito de portabilidade (art. 18) sem atalho operacional.

**Solução:** staff exporta JSON completo do paciente (cadastro, anamnese, evoluções,
condições, avaliações, consultas, faturas, consentimentos, referências das fotos) em um
clique no prontuário. Exportação auditada.

**Critérios de aceite:**
- JSON único, legível, com tudo que o sistema mantém sobre o titular.
- Geração registra evento de auditoria com ator.

### O4.4 — ADR: multi-tenancy

Multi-tenant (clinic_id em 20+ tabelas, isolamento, onboarding, billing) **não** cabe em
uma onda com responsabilidade. Entregável desta onda: **ADR** (Architecture Decision
Record) em `docs/adr/001-multi-tenancy.md` com a decisão recomendada (tenancy por
coluna + RLS vs. schema-per-tenant vs. deploy-per-tenant), plano de migração
incremental e o que **cada onda futura já deve fazer** para não aumentar o custo
(convenções de nome, nada de estado global por clínica, etc.).

---

## Métricas de sucesso da fase

- 100% dos agendamentos novos via catálogo em 30 dias (O1.1).
- 100% dos eventos de auditoria com pessoa identificada após adoção das contas (O1.2).
- PUSH registrado em ≥ 80% das avaliações de ferida com medida (O2.1).
- Kit baixado automaticamente em ≥ 90% das conclusões de procedimento com kit (O2.4).
- Clínica com 2 profissionais operando agenda simultânea sem conflito falso (O3.1).
- ≥ 50% dos pacientes ativos com consentimento digital em 90 dias (O4.1).

## Notas técnicas

- Mesma arquitetura DDD; enums novos preservam dados legados como texto (nunca
  migração destrutiva de conteúdo clínico).
- Senhas: `crypto.scrypt` (Node nativo, sem dependência nova), salt por conta,
  comparação em tempo constante.
- Toda onda: migração via drizzle-kit, testes BDD das invariantes, lint e build verdes
  antes do merge.
