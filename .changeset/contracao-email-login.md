---
"estomasystech": patch
---

Segurança: o login acha a conta só pelo índice cego do e-mail (`email_hash`), nunca pelo e-mail em claro. Saíram a busca pelo e-mail em claro e os
índices antigos sobre ele, e o banco passa a conferir que toda conta ativa tem o índice cego. Antes de publicar, a
verificação de integridade precisa mostrar `sem indice cego=0`.
