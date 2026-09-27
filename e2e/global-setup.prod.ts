import { runGlobalSetup } from "./global-setup";

/**
 * Setup da suíte contra o build de produção (#203): mesma semente, sem as
 * contas por papel — o servidor sobe com canal de e-mail, então o convite
 * delas não chega ao log, e nenhum spec do subconjunto as usa. Pelo mesmo
 * motivo, o Admin de Empresa da sessão padrão é um cookie assinado (ADR-007).
 */
export default function globalSetupProd(): Promise<void> {
  return runGlobalSetup({ roleAccounts: false });
}
