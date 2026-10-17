# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts --filter @ash/web...
COPY apps/web apps/web
RUN pnpm --filter @ash/web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN useradd --system --uid 10001 --create-home ash
WORKDIR /app
COPY --from=build --chown=ash /repo/apps/web/.next/standalone ./
COPY --from=build --chown=ash /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=ash /repo/apps/web/public ./apps/web/public
USER ash
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
