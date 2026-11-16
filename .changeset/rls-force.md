---
"estomasystech": patch
---

Última etapa do isolamento entre clínicas no banco: o Postgres passa a aplicar a regra de isolamento também ao dono das tabelas e cobre as tabelas de clínicas, tokens de acesso e segundo fator. Nada muda para quem usa o sistema hoje; a barreira só vale quando o dono trocar o usuário do banco, na ordem descrita no runbook.
