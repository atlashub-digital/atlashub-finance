# ARO API image. Build from repository root:
#   docker build -f infra/docker/Dockerfile -t aro-api .
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspaces --include-workspace-root
COPY apps/api apps/api
RUN npm run build -w @aro/api

FROM node:22-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev -w @aro/api --include-workspace-root=false

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 ARO_MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./package.json
COPY infra/migrations ./migrations
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
