---
"estomasystech": minor
---

Nova variável obrigatória em produção: `BLIND_INDEX_PEPPER` (mínimo 32 caracteres, gere com `openssl rand -hex 32`). É a chave do índice cego que vai permitir buscar o CPF, o telefone e o e-mail do paciente sem deixá-los legíveis no banco. O app passa a recusar subir em produção sem ela; o build não a exige. Configure-a no Coolify (e na Vercel da homologação) e guarde uma cópia no cofre antes do deploy. Esta versão só prepara a chave; nenhum dado é alterado.
