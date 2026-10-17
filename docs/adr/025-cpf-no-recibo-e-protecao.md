---
title: "ADR 025 — CPF do paciente e do pagador: opcional, cifrado, mascarado e exigido só no recibo"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
related: [docs/adr/006-chave-de-dados-clinicos.md, docs/adr/013-retencao-por-anonimizacao.md, docs/adr/017-retencao-decisoes-complementares.md]
---

# ADR 025 — CPF do paciente e do pagador: opcional, cifrado, mascarado e exigido só no recibo

- **Data:** 2026-10-17
- **Status:** aceito. Implementa a decisão delegada por @KalleoPinheiro na #218 (pergunta 2), fatia #326.
- **Domínios afetados:** financeiro, pacientes-prontuario

## Contexto

O recibo de saúde só vale para o IRPF com o CPF de quem pagou e o CPF/CNPJ de quem prestou o serviço.
O cadastro não tinha CPF, e o recibo (`REC-…`) saía sem os documentos, ou seja, sem valor fiscal. O
CPF é dado pessoal ligado a dado de saúde (LGPD): o requisito é emitir o recibo correto sem espalhar o
número pelo sistema.

## Decisão

1. **CPF opcional no cadastro, validado.** Idoso e estrangeiro podem não ter CPF. Quando informado, o
   domínio confere os dois dígitos verificadores e recusa sequências repetidas (`000.000.000-00`).
   Guarda a forma canônica de 11 dígitos; a máscara na entrada é tolerada. Vazio vira "não informado".
2. **Obrigatório só para emitir recibo.** Sem CPF do pagador ou sem CNPJ do prestador, o recibo é
   bloqueado com `400` e orientação ("informe o CPF na ficha do paciente…", "cadastre o CNPJ em
   Configurações"). A mesma checagem (`ResolveReceipt`) roda na tela e na emissão persistida
   (`POST /api/documents/issue`, que passa a exigir `invoiceId` para `recibo`), então chamar a rota
   direto não gera recibo inválido.
3. **Pagador distinto do paciente no recebimento.** Ao registrar o pagamento a equipe pode informar
   nome e CPF de quem pagou (um sem o outro é `400`). O pagador fica no recebimento, que é imutável
   (FIN-RN-12): o recibo sai no nome do pagador e cita o paciente. Sem pagador, vale o paciente.
4. **Prestador = a empresa, pelo CNPJ.** O CNPJ já é obrigatório no cadastro da empresa (B4). Não existe
   CPF de prestador: a empresa é pessoa jurídica, e o responsável técnico aparece por nome e registro no
   rodapé. Recibo de profissional autônomo pessoa física fica fora do escopo.
5. **Cifrado em repouso.** `patients.cpf` e `invoice_payments.payer_cpf` usam a cifra do ADR-006
   (AES-256-GCM, `DATA_ENCRYPTION_KEY`); `npm run data:reencrypt` cobre as duas colunas.
6. **Mascarado em toda parte, menos no recibo.** A API e as telas da equipe só recebem
   `***.***.247-**` (três dígitos do miolo, o bastante para conferir com o paciente). O CPF inteiro sai
   em dois lugares: `GET /api/invoices/:id/payments/:paymentId/receipt` (cada leitura é auditada como
   `read`/`recibo`, sem o número no registro) e na exportação do titular (art. 18, o paciente recebe o
   próprio dado). O portal do paciente e o do parceiro não recebem CPF. Nunca em log nem na trilha;
   `scrubText` já troca número longo por marcador nos erros enviados ao GlitchTip.
7. **Retenção.** A anonimização do paciente (ADR-013/017) apaga o CPF dele e o nome e CPF dos pagadores
   dos recebimentos dele; valor, forma e data ficam pelo prazo fiscal (FIN-RN-13). Depois disso o
   recibo não reemite, porque o paciente anonimizado não tem mais CPF.

## Consequências

- **Sem busca nem unicidade por CPF.** A cifra é aleatória, então o CPF não indexa: a recepção não
  procura paciente por CPF e o sistema não detecta o mesmo CPF em dois cadastros. Aceito: a prioridade
  é não guardar o número em claro. Reabrir só se houver pedido, com hash determinístico (HMAC) separado.
- **Reimpressão mostra o CPF atual.** O recibo é montado na hora, com o `REC-…` e a data persistidos. Se o
  CPF do paciente mudar depois, a reimpressão traz o novo. Congelar o CPF no recibo exigiria guardar uma
  cópia por emissão; não foi pedido.
- **Pagador não se corrige.** O recebimento é imutável; quem pagou é gravado na hora de receber. Para
  corrigir um pagador esquecido ou errado, ainda não há tela (ver relatório da #326).
- **A tela não remove CPF.** Digitar outro CPF troca; remover é só pela API (`cpf: ""`). Em branco na
  edição mantém o guardado, porque a ficha mostra só a máscara.
- **Migração 0060** adiciona três colunas anuláveis (`patients.cpf`, `invoice_payments.payer_name`,
  `invoice_payments.payer_cpf`); não toca dados existentes. Aplicar antes de subir o código.
