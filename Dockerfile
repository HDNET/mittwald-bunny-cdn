# Stage 1: Dependencies
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Stage 2: Build
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Strip npm/npx/yarn/corepack from the runtime image. The app is started via
# `node` directly — none of those tools run at runtime, but their bundled
# transitive deps (notably npm's own picomatch) trigger trivy findings on
# every build. Removing them shrinks the image and the attack surface.
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/yarn \
           /usr/local/bin/yarnpkg \
           /usr/local/bin/corepack

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 extension

COPY --from=builder --chown=extension:nodejs /app/.output ./
COPY --from=builder --chown=extension:nodejs /app/drizzle ./drizzle

RUN mkdir -p data && chown extension:nodejs data

USER extension

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server/index.mjs"]
