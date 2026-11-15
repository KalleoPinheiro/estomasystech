---
"estomasystech": minor
---

O e-mail usado para entrar no sistema passa a ficar cifrado no banco, como já acontece com os dados dos pacientes: quem lesse uma cópia do banco ou do backup não veria mais os e-mails de login da equipe. Entrar, convidar, recuperar a senha e o segundo fator continuam iguais. Depois da publicação, o dono roda a conversão dos cadastros existentes (`npm run data:reencrypt`).
