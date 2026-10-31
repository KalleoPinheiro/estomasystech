---
"estomasystech": patch
---

Limpeza interna (#595): remove o `RoleGate` do cliente, que já não era montado desde que cada segmento decide o papel no servidor (`requireStaffPageFor`, ADR-075). Nada muda para a clínica.
- **TESTE-ALTERADO**: componente sem uso, papel por tela decidido no servidor (ADR-075; cenário coberto por tests/lib/server/session.test.ts e e2e/casca-equipe-servidor.spec.ts). Saem de `tests/pages/staff-nav-role.test.tsx` os quatro cenários do `RoleGate` (C41 e três de render); os do `StaffNav` ficam.
