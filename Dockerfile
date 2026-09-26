FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Fuso explícito (#191/#205): sem ele a imagem roda em UTC e a grade, o "amanhã"
# dos lembretes e o horário dos e-mails deslocam 3h. A aplicação compara os dois
# na inicialização (src/instrumentation.ts) e recusa subir em produção se divergirem.
ENV TZ=America/Sao_Paulo
ENV APP_TIMEZONE=America/Sao_Paulo
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# Diretório das fotos com dono nextjs (#191): `COPY --chown` não muda o dono de
# /app, então o `mkdir` do upload falharia com EACCES rodando como nextjs. O
# compose monta o volume `uploads` aqui; o volume novo herda este dono.
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/auth/providers').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
