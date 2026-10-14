FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html styles.css app.js ./
COPY client ./client
COPY scripts/build.mjs ./scripts/build.mjs
ARG YIXUE_REVISION=development
RUN YIXUE_REVISION=$YIXUE_REVISION npm run build && npm prune --omit=dev

FROM node:24.21.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production YIXUE_HOST=0.0.0.0 YIXUE_PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY scripts/backup.mjs ./scripts/backup.mjs
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/start.js", "--serve-frontend"]
