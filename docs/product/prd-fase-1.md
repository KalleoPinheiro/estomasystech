---
title: "PRD — EstomaSysTech: Módulo Clínico para Estomaterapia"
status: frozen
audience: [po, stakeholder, dev]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# PRD — EstomaSysTech: Módulo Clínico para Estomaterapia

- **Versão:** 1.0
- **Data:** 2026-07-16
- **Status:** Aprovado para implementação (Fase 1)

---

## 1. Contexto e problema

A estomaterapia é uma especialidade de enfermagem focada em três grandes áreas: **estomias** (colostomia, ileostomia, urostomia), **feridas complexas** (úlceras por pressão, úlceras venosas/arteriais, pé diabético, deiscências) e **incontinências**. O cuidado é **longitudinal**: o mesmo paciente retorna dezenas de vezes ao longo de meses, e o valor clínico está em **medir a evolução** entre visitas.

O EstomaSysTech hoje resolve bem a camada administrativa — cadastro de pacientes, agenda com regras de horário, faturamento e integração com Google Calendar — mas não registra **nada do que acontece dentro da consulta**. Isso gera três dores reais em clínicas do setor:

1. **Sem prontuário, não há continuidade nem respaldo.** A evolução de enfermagem é exigência do COFEN (Resolução 429/2012 — registro obrigatório no prontuário) e a principal defesa legal do profissional.
2. **Sem medição seriada, não há prova de resultado.** Ferida que não é medida (comprimento × largura × profundidade, tecido, exsudato, dor) não demonstra cicatrização — e demonstrar resultado é o que sustenta o preço da consulta particular e a relação com convênios.
3. **Sem controle de insumos, a margem some.** Bolsas coletoras, placas de hidrocoloide, coberturas especiais e cremes barreira são caros, têm validade e são o segundo maior custo da clínica. Falta de material em atendimento é falha grave de operação.

Além disso, **paciente de estomaterapia que não retorna é risco clínico** (dermatite periestomal, retração, infecção) e receita perdida. Recall ativo de retornos é prática padrão das clínicas bem geridas.

## 2. Persona

- **Enf. estomaterapeuta (dona da clínica)** — atende, registra evolução, decide conduta, gerencia estoque e quer enxergar o negócio (faturamento, faltas, retornos pendentes).
- **Recepção/assistente** — agenda, confirma, recebe pagamento, dá saída em material usado.

## 3. Objetivo da Fase 1

Transformar o EstomaSysTech de agenda+faturamento em **sistema de gestão clínica completo** para estomaterapia: prontuário eletrônico com evolução SOAP, acompanhamento mensurável de estomias e feridas, controle de estoque de insumos com alerta, recall de retornos e relatório gerencial.

## 4. Features da Fase 1 (implementar agora)

### F1 — Prontuário do paciente com Anamnese
Página de prontuário por paciente concentrando toda a informação clínica.
- **Anamnese estruturada** (1 por paciente, editável): comorbidades (diabetes, HAS, vasculopatia…), alergias (adesivos, látex, sulfa…), medicações em uso, histórico cirúrgico, observações.
- **Critérios de aceite:** anamnese criada/atualizada em uma tela; alergias visíveis com destaque (segurança do cuidado).

### F2 — Evolução de enfermagem (SOAP)
Registro de evolução por atendimento, no padrão **SOAP** (Subjetivo, Objetivo, Avaliação, Plano), padrão de documentação clínica.
- Evoluções são **append-only** (imutáveis após criadas — princípio de integridade de prontuário).
- Podem ser vinculadas a uma consulta da agenda.
- **Critérios de aceite:** criar evolução exige ao menos um campo preenchido; listagem cronológica reversa no prontuário.

### F3 — Condições clínicas: estomias e feridas com avaliações seriadas
Cadastro de **condições** do paciente, cada uma com linha do tempo de **avaliações**:
- **Estomia:** tipo (colostomia, ileostomia, urostomia), data de confecção, avaliações registrando condição da pele periestomal e complicações (dermatite, prolapso, hérnia, retração, sangramento).
- **Ferida:** localização, avaliações com **medidas (C × L × P em mm)**, tipo de tecido predominante (granulação, esfacelo, necrose, epitelização), nível de exsudato (nenhum/baixo/moderado/alto), **escala de dor (0–10)**.
- Condição pode ser marcada como **resolvida** (alta daquela condição).
- **Critérios de aceite:** estomia exige tipo; dor válida só entre 0 e 10; medidas não-negativas; área calculada (C×L) para acompanhar tendência de cicatrização; condição resolvida não recebe nova avaliação.

### F4 — Estoque de insumos
Catálogo de materiais (bolsas, placas, coberturas, cremes) com controle de estoque:
- Cadastro com unidade, **estoque mínimo** e preço.
- **Movimentações** de entrada e saída com motivo (compra, uso em atendimento, perda/validade), histórico auditável.
- Saída **bloqueada se estoque insuficiente**.
- **Alerta de estoque baixo** no dashboard e na listagem.
- **Critérios de aceite:** estoque nunca negativo; alerta quando quantidade ≤ mínimo; movimentação registra motivo e data.

### F5 — Recall de retornos (follow-up)
- Ao **concluir** uma consulta, opção de programar retorno (7/15/30/60/90 dias) — cria pendência de retorno.
- Painel de **retornos pendentes/atrasados** no dashboard, com ação de marcar como agendado/concluído ou cancelar.
- **Critérios de aceite:** retorno criado automaticamente no fluxo de conclusão; atrasados destacados; pendência não some sozinha.

### F6 — Relatório gerencial mensal
- Consultas por status no mês, **taxa de falta (no-show)**, receita realizada × a receber, **receita por procedimento**.
- **Critérios de aceite:** taxa de falta = faltas ÷ (consultas não canceladas); receita por procedimento a partir das consultas concluídas.

## 5. Fora de escopo da Fase 1 (roadmap)

| Feature | Justificativa para fase futura |
|---------|-------------------------------|
| Fotos de evolução de ferida | Exige storage de arquivos + LGPD de imagem; alto valor, fase 2 |
| Lembretes por WhatsApp (confirmação e recall) | Exige API paga (Meta/Twilio); fase 2 |
| Documentos: termo de consentimento, atestado, relatório p/ convênio | Templates + PDF; fase 2 |
| Faturamento TISS / convênios | Complexidade regulatória alta; hoje foco em particular |
| Prescrição/dispensação de material por paciente | Depende de F4 maduro; fase 2 |
| Portal do paciente | Fase 3 |
| Multi-profissional com agenda por recurso | Fase 3 |
| Assinatura digital ICP-Brasil no prontuário | Fase 3 |

## 6. Métricas de sucesso

- 100% das consultas concluídas com evolução registrada (meta operacional da clínica).
- Zero atendimentos sem material (alerta de estoque atuando).
- Taxa de retorno realizado ≥ 80% dos retornos programados.
- Tempo de registro de evolução ≤ 3 min.

## 7. Notas técnicas

- Mesma arquitetura DDD: domínio puro (`clinical`, `inventory`, `followup`) → use cases → Drizzle/PostgreSQL → API REST → UI.
- Evolução SOAP imutável (sem update/delete) — integridade de prontuário.
- Dados clínicos são sensíveis (LGPD art. 11): acesso hoje é single-tenant local; autenticação/autorização entra no roadmap antes de qualquer exposição pública.
- Testes BDD cobrindo todas as invariantes clínicas (dor 0–10, estoque não-negativo, estomia exige tipo, etc.).
