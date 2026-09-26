/**
 * `crypto.randomUUID` global (Web Crypto: Node ≥ 19 e navegadores), não
 * `node:crypto`: este módulo chega ao bundle do cliente (agenda, portal,
 * documentos) e o polyfill de `node:crypto` arrastava uma sonda
 * `Function(...)` que a CSP estrita de produção bloqueia (#203).
 */
export const newId = (): string => globalThis.crypto.randomUUID();
