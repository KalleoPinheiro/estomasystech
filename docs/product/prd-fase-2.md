---
title: "PRD — EstomaSysTech Fase 2: Prova de Resultado, Margem e Operação"
status: frozen
audience: [po, stakeholder, dev]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# PRD — EstomaSysTech Fase 2: Prova de Resultado, Margem e Operação

- **Versão:** 1.0
- **Data:** 2026-07-18
- **Status:** Aprovado para implementação
- **Antecessor:** [prd-fase-1.md](./prd-fase-1.md) (Fase 1 — módulo clínico, entregue)

---

## 1. Contexto

A Fase 1 entregou o núcleo clínico (anamnese, SOAP, condições com avaliações seriadas, estoque, recall, relatório) e, adiantando o roadmap, os portais de paciente e médico parceiro com RBAC. As três dores originais do PRD seguem parcialmente abertas:

1. **Prova de resultado** — as medidas seriadas existem, mas ninguém as *vê*: não há visualização de tendência nem registro fotográfico.
2. **Margem** — receita por procedimento existe; custo de insumos por atendimento não. A margem real é invisível.
3. **Operação** — no-show é medido mas não combatido; recall depende de alguém olhar o dashboard; ruptura de estoque só é percebida quando acontece.

A Fase 2 fecha essas lacunas e adiciona a fundação de compliance (auditoria) exigida antes de crescer a equipe (multi-profissional).

## 2. Features

### F1 — Gráfico de cicatrização por condição

**Problema:** avaliações registram C×L×P, dor e exsudato, mas a evolução só é visível lendo registros um a um.

**Solução:** linha do tempo visual por condição — área (C×L, mm²) e dor (0–10) por data de avaliação — renderizada no prontuário (staff), no portal do paciente e no portal do parceiro.

**Escopo:**
- Componente de gráfico SVG próprio (sem dependência externa; CSP `default-src 'self'` mantido).
- Série de área: só avaliações com C e L preenchidos. Série de dor: só com dor preenchida.
- Tendência textual: variação percentual da área entre primeira e última avaliação ("área reduziu 62% desde o início").

**Critérios de aceite:**
- Condição com < 2 avaliações mensuráveis não exibe gráfico (exibe aviso "registre medidas para acompanhar a tendência").
- Gráfico idêntico nos três contextos (staff, paciente, parceiro) — dados já minimizados pelos portais.
- Zero requisições externas.

**Dados/API:** nenhum campo novo — usa `condition_assessments` existente.

---

### F2 — Confirmação de consulta pelo paciente

**Problema:** taxa de no-show é medida (relatório mensal) mas não há mecanismo para reduzi-la. Confirmação hoje é manual pela recepção.

**Solução:** paciente confirma presença pelo próprio portal; consulta muda para `confirmed` e some da lista de "aguardando confirmação" da recepção.

**Escopo:**
- Portal do paciente: botão **Confirmar presença** em consultas futuras com status `scheduled`.
- Rota `POST /api/portal/patient/appointments/[id]/confirm` — escopada à sessão: só confirma consulta cujo `patientId` pertence ao email autenticado.
- Reusa a transição de domínio `appointment.confirm()` (invariantes preservadas).

**Critérios de aceite:**
- Paciente não confirma consulta de outro paciente (403/404).
- Consulta cancelada/concluída/passada não é confirmável.
- Ação idempotente-amigável: confirmar consulta já confirmada não é erro destrutivo (retorna estado atual).

---

### F3 — Custo de insumos por atendimento e margem por procedimento

**Problema:** estoque e faturamento não se falam. A clínica sabe a receita por procedimento, não a margem.

**Solução:** saída de estoque pode ser vinculada a uma consulta. Relatório mensal passa a mostrar custo de insumos e margem (receita − custo) por procedimento.

**Escopo:**
- `stock_movements.appointment_id` (nullable, FK) — migração.
- Registro de saída "uso em atendimento" com seleção da consulta do dia (UI em Materiais e no fluxo de conclusão da consulta).
- Relatório mensal: coluna custo de insumos e margem por procedimento (JOIN saídas↔consultas concluídas no período).
- Custo do movimento congelado no momento da saída (`unit_price_cents` copiado do insumo) — mudança futura de preço não reescreve custo histórico.

**Critérios de aceite:**
- Saída vinculada a consulta aparece no custo do procedimento do mês da consulta.
- Movimentos sem vínculo não entram na margem (aparecem como "custo não atribuído" no relatório).
- Estoque nunca negativo (invariante preservada).

---

### F4 — Trilha de auditoria de prontuário

**Problema:** dados de saúde (LGPD art. 11) sem registro de quem acessou/alterou o quê. Pré-requisito para multi-profissional e para qualquer incidente.

**Solução:** log append-only de eventos de acesso e mutação sobre dados clínicos, com tela de consulta para o staff.

**Escopo:**
- Tabela `audit_events`: id, occurred_at, actor (papel + identificador da sessão), action (`read`/`create`/`update`), resource (tipo + id), patient_id (quando aplicável), detail (texto curto).
- Registro nas rotas de prontuário (anamnese, evoluções, condições, avaliações, portal) — gravado via `after()` para não somar latência ao request.
- Tela `/auditoria` (staff): filtro por paciente e período, ordenação decrescente, paginada.
- Sem update/delete na tabela (append-only, como as evoluções SOAP).

**Critérios de aceite:**
- Toda leitura de prontuário via API gera evento com ator e paciente.
- Falha ao auditar não falha o request (best-effort, logada no servidor).
- Tela lista eventos com paginação e nunca expõe conteúdo clínico no log (só metadados).

---

### F5 — Previsão de ruptura e validade de lotes

**Problema:** alerta atual é reativo (estoque ≤ mínimo). Perda por validade é registrada só depois do prejuízo.

**Solução:** previsão de dias até ruptura pelo consumo médio, e lotes de entrada com validade + alerta de vencimento.

**Escopo:**
- Consumo médio diário por insumo = saídas dos últimos 90 dias ÷ 90 (agregação SQL).
- Materiais e dashboard: "acaba em ~X dias" quando X ≤ 30; ordenável por urgência.
- `supply_batches`: entradas podem informar lote e validade; alerta para lotes vencendo em ≤ 30 dias e vencidos.
- Saída consome do lote de validade mais próxima (FEFO) quando lotes existem; sem lote informado, comportamento atual inalterado (retrocompatível).

**Critérios de aceite:**
- Insumo sem saída em 90 dias não exibe previsão (não há base de cálculo).
- Lote vencido destacado; soma dos lotes nunca excede o estoque do insumo.
- Entrada sem lote continua válida (campos opcionais).

---

### F6 — Fotos de evolução de ferida

**Problema:** medidas numéricas sem registro visual. Foto seriada é prova clínica e comercial padrão da especialidade.

**Solução:** foto(s) por avaliação de condição, com comparação lado a lado (primeira × mais recente).

**Escopo:**
- `condition_photos`: id, condition_id, assessment_id (nullable), content_type, size, created_at; arquivo em disco local (`UPLOADS_DIR`, default `./uploads`, volume no Docker).
- Upload multipart `POST /api/conditions/[id]/photos` (staff): JPEG/PNG/WebP, máx. 5 MB, nome de arquivo gerado pelo servidor (UUID) — nunca o nome original.
- Servido por rota autorizada `GET /api/photos/[id]` (staff ou dono no portal do paciente; **parceiro não vê fotos** — minimização LGPD).
- Prontuário: galeria por condição + comparação lado a lado.
- Exclusão permitida apenas para staff (correção de upload errado), gera evento de auditoria (F4).

**Critérios de aceite:**
- Content-type validado por magic bytes, não só extensão.
- Acesso sem sessão válida → 401; paciente só acessa foto de condição própria.
- Upload não passa pelo bundle do Next (streaming para disco); arquivos fora do diretório público.

---

### F7 — Documentos clínicos

**Problema:** termo de consentimento, atestado e relatório para o médico parceiro são feitos fora do sistema.

**Solução:** páginas print-ready (A4, `@media print`) geradas com dados do sistema — o navegador imprime/salva em PDF. Sem dependência de biblioteca PDF.

**Escopo:**
- Dados da clínica (nome, CNPJ, endereço, profissional responsável, COREN) via env/config.
- **Termo de consentimento** por paciente (template com identificação e texto configurável).
- **Atestado/declaração de comparecimento** por consulta (data, horário, procedimento).
- **Relatório de evolução para o parceiro** por condição: identificação, resumo das avaliações, gráfico de cicatrização (F1), sem dados financeiros.
- Rotas staff `/documentos/...`; geração gera evento de auditoria (F4).

**Critérios de aceite:**
- Impressão em A4 sem elementos de navegação (CSS print).
- Relatório do parceiro respeita a mesma minimização do portal (sem anamnese, sem financeiro).

---

### F8 — Lembretes por WhatsApp

**Problema:** confirmação (F2) e recall dependem de o paciente entrar no portal. Canal ativo reduz no-show e retorno perdido.

**Solução (histórico — gateway removido na #328, RM-14 planejado):** port `MessagingGateway` com dois adapters — Meta WhatsApp Cloud API (configurado por env) e Null (default, desativado). Job de lembretes disparável por endpoint protegido (cron externo).

**Escopo:**
- Port em `application/ports/messaging-gateway.ts`; adapter Meta Cloud API (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, templates aprovados) e `NullMessagingGateway`.
- `POST /api/reminders/run` (header `x-cron-secret` = `CRON_SECRET`): envia confirmação D-1 (consultas `scheduled` de amanhã) e recall (follow-ups `pending` vencidos há ≥ 1 dia).
- Idempotência: `reminder_log` (tipo + referência + data) impede reenvio no mesmo dia.
- Sem credenciais → job roda, loga o que enviaria (dry-run) e não falha.

**Critérios de aceite:**
- Mesmo lembrete não é enviado duas vezes no mesmo dia.
- Falha de envio individual não aborta o lote; resultado do job resume enviados/falhos/pulados.
- Endpoint sem secret → 401.

---

### F9 — Multi-profissional (mínimo viável)

**Problema:** sistema assume um único profissional. Crescer a equipe exige atribuição e autoria.

**Solução:** cadastro de profissionais, atribuição opcional em consultas, autoria em evoluções, filtro na agenda.

**Escopo:**
- `professionals`: id, nome, registro (COREN/CRM), ativo.
- `appointments.professional_id` e `evolution_notes.professional_id` (nullable — retrocompatível com histórico).
- Agenda: filtro por profissional; formulário de consulta com seleção.
- Evolução nova registra o profissional selecionado (autoria).
- **Fora de escopo:** login individual por profissional, agenda por recurso com conflito por profissional, permissões por papel clínico (fase 3).

**Critérios de aceite:**
- Consulta sem profissional continua válida (dados históricos intactos).
- Filtro da agenda respeitado nas queries (não filtra em memória).
- Conflito de horário segue global (single-room) — documentado como limitação.

## 3. Ordem de implementação

| # | Feature | Dependências | Justificativa |
|---|---------|--------------|---------------|
| 1 | F1 Gráfico | — | Prova de resultado com dados existentes |
| 2 | F2 Confirmação | — | Ataca no-show sem custo externo |
| 3 | F3 Margem | migração | Decisão de preço; base p/ F5 |
| 4 | F4 Auditoria | migração | Compliance antes de crescer superfície |
| 5 | F5 Estoque preditivo | F3 | Agregações de consumo |
| 6 | F6 Fotos | F4 (auditoria) | Storage + LGPD |
| 7 | F7 Documentos | F1, F6 | Reusa gráfico e fotos |
| 8 | F8 WhatsApp | F2 | Lembrete aponta p/ confirmação |
| 9 | F9 Multi-profissional | F4 | Autoria auditada |

## 4. Métricas de sucesso

- No-show: queda ≥ 30% após F2+F8 (baseline: relatório mensal atual).
- 100% das saídas de material de atendimento vinculadas a consulta (F3).
- Zero perda por validade não antecipada por alerta (F5).
- ≥ 80% das condições ativas de ferida com foto na última avaliação (F6).

## 5. Notas técnicas

- Mesma arquitetura DDD; nada de dependência nova de UI (gráfico SVG próprio, documentos via CSS print).
- CSP atual (`default-src 'self'`) preservada em todas as features.
- Novos dados sensíveis (fotos) fora do diretório público, servidos por rota autorizada, ausentes do portal do parceiro.
- Toda feature com testes de domínio/use case; migrações via drizzle-kit.
