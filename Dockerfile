# syntax=docker/dockerfile:1

# ---- base: node + pnpm ----
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# ---- deps: full install (dev deps are needed to compile) ----
# argon2 ships prebuilt musl binaries, so no compiler toolchain is required.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build: compile TypeScript, then drop dev deps ----
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

# ---- runtime: minimal image, non-root ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json docker-entrypoint.sh ./
COPY --chown=node:node migrations ./migrations
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:${PORT:-4000}/health || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
