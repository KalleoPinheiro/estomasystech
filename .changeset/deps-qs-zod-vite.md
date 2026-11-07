---
"estomasystech": patch
---

Atualização de dependências: `zod` 4.4.3 para 4.6.7 (validação de entrada, com correção que confere os limites de tamanho de array, set e map antes de validar os elementos), `qs` 6.16.0 para 6.17.1 e `vite` 8.2.2 para 8.3.6. Para clientes externos da API: desde o zod 4.5, `z.iso.datetime()` exige segundos, então uma data como `2026-01-01T06:15Z` passa a ser rejeitada nas rotas de agendamento, fatura, pacote, follow-up, auditoria e portal; `2026-01-01T06:15:00Z` continua valendo. A interface da clínica já envia segundos, então nada muda para quem a usa.
