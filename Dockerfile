# Multi-stage: build the whole workspace, then ship only what runtime needs.

FROM node:22-alpine AS builder
WORKDIR /app

# Manifests first so the dependency layer caches independently of source edits.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/llm/package.json packages/llm/
RUN npm ci

COPY tsconfig*.json ./
COPY packages packages
COPY apps apps

RUN npm run build --workspaces --if-present


FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY packages/contracts/package.json packages/contracts/
COPY packages/llm/package.json packages/llm/
# The web build is static output — its dependencies are not needed at runtime.
RUN npm ci --omit=dev --workspace @groupchat/server --include-workspace-root

COPY --from=builder /app/apps/server/dist apps/server/dist
COPY --from=builder /app/packages/contracts/dist packages/contracts/dist
COPY --from=builder /app/packages/llm/dist packages/llm/dist
COPY --from=builder /app/apps/web/dist apps/web/dist

# Runs unprivileged; the node image ships a `node` user for exactly this.
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/main.js"]
