---
"estomasystech": patch
---

A conexão da aplicação com o banco passa a aceitar uma variável própria, `DATABASE_APP_URL`, para o usuário restrito do banco. Serve para quem usa um banco cuja variável `DATABASE_URL` é gerenciada por uma integração e não pode ser editada. Sem a nova variável, nada muda: a aplicação segue usando `DATABASE_URL`.
